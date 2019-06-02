const ptvAPI = require('./ptv-api');
const EventEmitter = require('events');
const safeRegex = require('safe-regex');
const { updateBusStopFromPTVStopID } = require('./bus-stop');
const { getFirstBus, getLastBus, getFrequencies,
    getNextWeekday, getNextSaturday, getNextSunday } = require('./service-stats');
const TimedCache = require('timed-cache');

function getServiceNumber(service) {
    if (service.toLowerCase().startsWith('telebus'))
        return 'TB';
    return service.replace(/[A-Za-z# ]/g, '');
}

function getServiceVariant(service) {
    if (service.toLowerCase().startsWith('telebus'))
        return service.replace(/[A-Za-z# ]/g, '');
    return service.replace(/[0-9]/g, '');
}

function adjustDestination(dest) {
    if (dest === 'Stud Park SC (Rowville)') {
        return 'Stud Park SC'
    }

    if (dest.includes('Monash University')) {
        let campus = dest.match(/\((\w+)/);
        campus = campus ? campus[1] : 'Clayton';

        return `Monash University (${campus} Campus)`;
    }

    if (dest.toLowerCase().includes('anti-clockwise')) {
        dest = dest.replace(/\(anti-clockwise\)/i, '') + '(Anti-Clockwise)';
    } else if (dest.toLowerCase().includes('clockwise')) {
        dest = dest.replace(/\(clockwise\)/i, '') + '(Clockwise)';
    }

    return dest.replace(/  +/, ' ');
}

let serviceLocks = {};
let directionLocks = {};

let serviceCache = new TimedCache({ defaultTtl: 1000 * 60 * 5 });

function getDirectionID(skeleton, cb) {
    let {ptvRouteID} = skeleton;
    if (directionLocks[ptvRouteID]) {
        directionLocks[ptvRouteID].on('loaded', directionID => {
            cb(directionID);
        });
        return;
    }

    directionLocks[ptvRouteID] = new EventEmitter();
    directionLocks[ptvRouteID].setMaxListeners(30);

    ptvAPI.makeRequest('/v3/directions/route/' + ptvRouteID, (err, data) => {
        let directionID = data.directions.map(e => {
            e.direction_name = adjustDestination(e.direction_name);
            return e;
        }).filter(service => skeleton.destination.includes(service.direction_name) || service.direction_name.includes(skeleton.destination))[0].direction_id;

        skeleton.directionID = directionID;
        directionLocks[ptvRouteID].emit('loaded', directionID);
        delete directionLocks[ptvRouteID];

        cb(skeleton);
    });
}

function populateService(skeleton, callback) {
    function loadStops() {
        ptvAPI.makeRequest('/v3/stops/route/' + ptvRouteID + '/route_type/2?direction_id=' + skeleton.directionID, (err, data) => {
            skeleton.stops = data.stops.sort((a, b) => a.stop_sequence - b.stop_sequence).filter(busStop => busStop.stop_sequence !== 0).map(busStop => {
                return {
                    busStopCode: busStop.stop_id,
                    busStopName: busStop.stop_name,
                    suburb: busStop.stop_suburb,
                    stopNumber: busStop.stop_sequence
                }
            });
            skeleton.skeleton = false;

            serviceLocks[id].emit('loaded', skeleton);
            delete serviceLocks[id];

            serviceCache.put(id, skeleton);
            callback(skeleton);
        });
    }
    let {ptvRouteID, fullService, serviceType, destination} = skeleton;
    let id = fullService + destination + '-' + serviceType.toLowerCase();

    if (serviceLocks[id]) {
        serviceLocks[id].on('loaded', updatedService => {
            callback(updatedService);
        });
        return;
    }
    if (serviceCache.get(id)) {
        callback(serviceCache.get(id));
        return;
    }

    serviceLocks[id] = new EventEmitter();
    serviceLocks[id].setMaxListeners(30);

    let directionID = skeleton.directionID || 0;
    if (directionID) loadStops(); else getDirectionID(skeleton, loadStops);

}

function checkStopIDs(service, db, callback) {
    let promises = [];
    let busStops = db.getCollection('bus stops');
    let finalStops = [];

    service.stops.forEach((stop, i) => {
        promises.push(new Promise(resolve => {
            busStops.findDocument({
                busStopCodes: stop.busStopCode
            }, (err, busStop) => {
                function done(busStop) {
                    finalStops[i] = Object.assign(stop, {
                        cleanSuburb: busStop.cleanSuburb,
                        cleanBusStopName: busStop.cleanBusStopName
                    });
                    resolve();
                }

                if (busStop) done(busStop);
                else updateBusStopFromPTVStopID(stop.busStopCode, db, done);
            });
        }));
    });

    Promise.all(promises).then(() => {
        db.getCollection('bus services').updateDocument({ _id: service._id }, {
            $set: {
                stops: finalStops
            }
        }, () => callback());
    });
}

function getServiceData(serviceNumber, db, callback) {
    if (serviceNumber.match(/[a-z]/i) && safeRegex(serviceNumber))
        serviceNumber = new RegExp(serviceNumber, 'i');

    queryServiceData({ fullService: serviceNumber }, db, callback);
}

function loadFrequency(service, db, callback) {
    let promises = [];

    let freqFunc = getFrequencies.bind(null, service.ptvRouteID, 2, service.stops[0].busStopCode, service.directionID);
    let days = {
        weekday: getNextWeekday(),
        saturday: getNextSaturday(),
        sunday: getNextSunday()
    };

    let frequencies = {};

    Object.keys(days).forEach(day => {
        promises.push(new Promise(resolve => {
            freqFunc(days[day], frequency => {
                frequencies[day] = frequency;
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => {
        callback(frequencies);
    });
}

function getFirstLastBus(service, db, callback) {
    let promises = [];

    let firstBusFunc = getFirstBus.bind(null, service.ptvRouteID, 2, service.stops[0].busStopCode, service.directionID);
    let lastBusFunc = getLastBus.bind(null, service.ptvRouteID, 2, service.stops[0].busStopCode, service.directionID);
    let days = {
        weekday: getNextWeekday(),
        saturday: getNextSaturday(),
        sunday: getNextSunday()
    };

    let buses = {};

    Object.keys(days).forEach(day => {
        promises.push(new Promise(resolve => {
            firstBusFunc(days[day], firstBus => {
                lastBusFunc(days[day], lastBus => {
                    buses[day] = {firstBus, lastBus};
                    resolve();
                });
            });
        }));
    });

    Promise.all(promises).then(() => {
        callback(buses);
    });
}

function queryServiceDataWithoutUpdate(query, db, callback) {
    let finalServices = [];
    let promises = [];

    db.getCollection('bus services').findDocuments(query).toArray((err, services) => {
        services.forEach(service => {
            promises.push(new Promise(resolve => {
                if (service.directionID) {
                    finalServices.push(service);
                    resolve();
                } else {
                    getDirectionID(service, updatedService => {
                        finalServices.push(updatedService);
                        resolve();
                    });
                }
            }));
        });

        Promise.all(promises).then(() => callback(finalServices));
    });
}

function queryServiceData(query, db, callback) {
    let finalServices = [];
    let promises = [];

    db.getCollection('bus services').findDocuments(query).toArray((err, services) => {
        services.forEach(service => {
            promises.push(new Promise(resolve => {
                if (service.skeleton || !service.stops.length) {
                    populateService(service, updatedService => {
                        finalServices.push(updatedService);

                        db.getCollection('bus services').updateDocument({_id: service._id}, { $set: updatedService }, () => {
                            let termini = [updatedService.stops[0], updatedService.stops.slice(-1)[0]];
                            let p = [];
                            termini.forEach(terminus => {
                                p.push(new Promise(r => {
                                    updateBusStopFromPTVStopID(terminus.busStopCode, db, r);
                                }));
                            })

                            Promise.all(p).then(resolve);
                        });
                    });
                } else {
                    finalServices.push(service);
                    resolve();
                }
            }));
        });

        Promise.all(promises).then(() => {
            let promises2 = [];
            finalServices.forEach(service => {
                promises2.push(new Promise(resolve => {
                    if (!service.frequency)
                        loadFrequency(service, db, frequency => {
                            getFirstLastBus(service, db, firstLastBus => {
                                service.frequency = frequency;
                                service.firstLastBus = firstLastBus;

                                db.getCollection('bus services').updateDocument({_id: service._id}, { $set: service }, () => {
                                    resolve();
                                });
                            });
                        })
                    else resolve();
                }));
            })

            Promise.all(promises2).then(() => {
                callback(finalServices.sort((a, b) => (a.serviceNumber*1 || a.serviceVariant) - (b.serviceNumber*1 || b.serviceVariant)));
            });
        });
    });
}

function resetServiceDirections(serviceID, db, callback) {
    db.getCollection('bus services').updateDocuments({
        ptvRouteID: serviceID
    }, {
        $set: {
            directionID: 0
        }
    }, () => {
        let p = [];
        let finalServices = [];
        db.getCollection('bus services').findDocuments({ ptvRouteID: serviceID }).toArray((err, newSkeletons) => {
            newSkeletons.forEach(newSkeleton => {
                p.push(new Promise(resolve => {
                    populateService(newSkeleton, service => {
                        db.getCollection('bus services').updateDocument({_id: newSkeleton._id}, { $set: service }, () => {
                            finalServices.push(service);
                            resolve();
                        });
                    });
                }));
            });

            Promise.all(p).then(() => callback(finalServices));
        });
    });
}

module.exports = {
    getServiceNumber,
    getServiceVariant,
    adjustDestination,
    getServiceData,
    queryServiceData,
    queryServiceDataWithoutUpdate,
    resetServiceDirections,
    checkStopIDs
};
