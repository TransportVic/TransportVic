const ptvAPI = require('./ptv-api');
const EventEmitter = require('events');

function getServiceNumber(service) {
    return service.replace(/[A-Za-z# ]/g, '');
}

function getServiceVariant(service) {
    if (service.toLowerCase().startsWith('telebus'))
        return 'TeleBus';
    return service.replace(/[0-9]/g, '');
}

function adjustDestination(dest) {
    if (dest.includes('Monash University')) {
        let campus = dest.match(/\((\w+)/);
        campus = campus ? campus[1] : 'Clayton';

        return `Monash University (${campus} Campus)`;
    }

    return dest;
}

let serviceLocks = {};
let directionLocks = {};

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
            let directionID = data.directions.map(e => {
                e.direction_name = adjustDestination(e.direction_name);
                return e;
            }).filter(service => skeleton.destination.startsWith(service.direction_name))[0].direction_id;

            skeleton.directionID = directionID;
            directionLocks[id].emit('loaded', directionID);
            setTimeout(() => {
                delete directionLocks[id];
            }, 100);

            cb();
        });
    }

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
            setTimeout(() => {
                delete serviceLocks[id];
            }, 100);

            callback(skeleton);
        });
    }
    let {ptvRouteID, fullService, serviceType} = skeleton;
    let id = fullService + '-' + serviceType;

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

function getServiceData(serviceNumber, db, callback) {
    queryServiceData({ fullService: serviceNumber }, db, callback);
}

function queryServiceData(query, db, callback) {
    let finalServices = [];
    let promises = [];

    db.getCollection('bus services').findDocuments(query).toArray((err, services) => {
        services.forEach(service => {
            promises.push(new Promise(resolve => {
                if (service.skeleton) {
                    populateService(service, updatedService => {
                        finalServices.push(updatedService);
                        db.getCollection('bus services').updateDocument({_id: service._id}, { $set: updatedService }, resolve);
                    });
                } else {
                    finalServices.push(service);
                    resolve();
                }
            }));
        });

        Promise.all(promises).then(() => callback(finalServices));
    });
}

module.exports = {
    getServiceNumber,
    getServiceVariant,
    adjustDestination,
    getServiceData,
    queryServiceData
};
