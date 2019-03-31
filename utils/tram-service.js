const ptvAPI = require('./ptv-api');
const EventEmitter = require('events');
const safeRegex = require('safe-regex');
const { updateTramStopsAsNeeded } = require('./tram-stop');

let serviceLocks = {};
let directionLocks = {};

function getServiceData(serviceNumber, db, callback) {
    if (serviceNumber.match(/[a-z]/i) && safeRegex(serviceNumber))
        serviceNumber = new RegExp(serviceNumber, 'i');

    queryServiceData({ serviceNumber: serviceNumber }, db, callback);
}

function populateService(skeleton, callback) {

    function getDirectionID(cb) {
        if (directionLocks[id]) {
            directionLocks[id].on('loaded', directionID => {
                cb(directionID);
            });
            return;
        }

        directionLocks[id] = new EventEmitter();
        directionLocks[id].setMaxListeners(30);

        ptvAPI.makeRequest('/v3/directions/route/' + ptvRouteID, (err, data) => {
            let directionID = data.directions.filter(service => skeleton.destination.includes(service.direction_name) || service.direction_name.includes(skeleton.destination))[0].direction_id;

            skeleton.directionID = directionID;
            directionLocks[id].emit('loaded', directionID);
            delete directionLocks[id];

            cb();
        });
    }

    function loadStops() {
        ptvAPI.makeRequest('/v3/stops/route/' + ptvRouteID + '/route_type/1?direction_id=' + skeleton.directionID, (err, data) => {
            data.stops = data.stops.sort((a, b) => a.stop_sequence - b.stop_sequence).filter(stop => stop.stop_sequence !== 0).filter(tramStop => {
                if (tramStop.stop_id == 2970) return false
                return true;
            });

            if (skeleton.serviceNumber === '96' && skeleton.directionID === 36) {
                data.stops.push({
                    stop_id: 2284,
                    stop_name: "145 Acland St #2",
                    stop_suburb: "St Kilda",
                });
            }
            skeleton.stops = data.stops.map((tramStop, i) => {
                if (tramStop.stop_suburb == 'Docklands') {
                    tramStop.stop_name = tramStop.stop_name.replace(/^D\d+-/, '');
                }

                return {
                    tramStopCode: tramStop.stop_id,
                    tramStopName: tramStop.stop_name.replace(/ #.+$/, ''),
                    suburb: tramStop.stop_suburb,
                    stopNumber: i + 1
                }
            });
            skeleton.skeleton = false;

            serviceLocks[id].emit('loaded', skeleton);
            delete serviceLocks[id];

            callback(skeleton);
        });
    }
    let {ptvRouteID, serviceNumber, destination} = skeleton;
    let id = serviceNumber + destination;

    if (serviceLocks[id]) {
        serviceLocks[id].on('loaded', updatedService => {
            callback(updatedService);
        });
        return;
    }

    serviceLocks[id] = new EventEmitter();
    serviceLocks[id].setMaxListeners(30);

    let directionID = skeleton.directionID || 0;
    if (directionID) loadStops(); else getDirectionID(loadStops);

}

function queryServiceData(query, db, callback) {
    let finalServices = [];
    let promises = [];

    db.getCollection('tram services').findDocuments(query).toArray((err, services) => {
        services.forEach(service => {
            promises.push(new Promise(resolve => {
                if (service.skeleton) {
                    populateService(service, updatedService => {
                        finalServices.push(updatedService);

                        db.getCollection('tram services').updateDocument({_id: service._id}, { $set: updatedService }, () => {
                            let termini = [updatedService.stops[0], updatedService.stops.slice(-1)[0]];
                            db.getCollection('tram stops').findDocuments({
                                $or: termini.map(tramStop => {return {
                                    tramStopName: new RegExp(tramStop.tramStopName.replace(/([*+?])/g, '\\$1'), 'i'),
                                    suburb: tramStop.suburb
                                }})
                            }).toArray((err, termini) => {
                                updateTramStopsAsNeeded(termini, db, resolve);
                            });
                        });
                    });
                } else {
                    finalServices.push(service);
                    resolve();
                }
            }));
        });

        Promise.all(promises).then(() => callback(finalServices.sort((a, b) => (a.serviceNumber*1) - (b.serviceNumber*1))));
    });
}

module.exports = {
    queryServiceData,
    getServiceData
}
