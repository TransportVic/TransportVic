const ptvAPI = require('./ptv-api');

function getServiceNumber(service) {
    if (service.startsWith('Telebus'))
        return 'Telebus'
    return service.replace(/[A-Za-z#]/g, '');
}

function getServiceVariant(service) {
    if (service.startsWith('Telebus'))
        return service.match(/([0-9]+)/)[1];
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

function populateService(skeleton, callback) {
    function getDirectionID(cb) {
        ptvAPI.makeRequest('/v3/directions/route/' + ptvRouteID, (err, data) => {
            let directionID = data.directions.map(e => {
                e.direction_name = adjustDestination(e.direction_name);
                return e;
            }).filter(service => service.direction_name === skeleton.destination)[0].direction_id;

            skeleton.directionID = directionID;

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

            callback(skeleton);
        });
    }

    let {ptvRouteID} = skeleton;

    let directionID = skeleton.directionID || 0;
    if (directionID) loadStops(); else getDirectionID(loadStops);

}

function getServiceData(serviceNumber, db, callback) {
    let finalServices = [];
    let promises = [];

    db.getCollection('bus services').findDocuments({ fullService: serviceNumber }).toArray((err, services) => {
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
    getServiceData
};
