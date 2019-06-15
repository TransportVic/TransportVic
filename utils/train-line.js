const ptvAPI = require('./ptv-api');
const EventEmitter = require('events');
const TimedCache = require('timed-cache');
const { getFrequency, getFirstLastService } = require('./service-stats');

let serviceLocks = {};
let directionLocks = {};

let stopsCache = new TimedCache({ defaultTtl: 1000 * 60 * 5 });

function getTrainLine(key, db, callback) {
    db.getCollection('train lines').findDocument({
        $or: [
            { ptvRouteID: key },
            { cleanLineName: key },
            { lineName: key }
        ]
    }, (err, lineData) => {
        callback(lineData);
    });
}

function adjustDestination(destinationName) {
    if (destinationName === 'City (Flinders Street)') {
        return 'City'
    }
    return destinationName;
}

function loadDirections(skeleton, callback) {
    let {ptvRouteID} = skeleton;
    if (directionLocks[ptvRouteID]) {
        directionLocks[ptvRouteID].on('loaded', directions => {
            skeleton.directions = directions;
            callback(skeleton);
        });
        return;
    }

    directionLocks[ptvRouteID] = new EventEmitter();
    directionLocks[ptvRouteID].setMaxListeners(30);

    ptvAPI.makeRequest('/v3/directions/route/' + ptvRouteID, (err, data) => {
        let directions = data.directions.reduce((acc, direction) => {
            let directionName = adjustDestination(direction.direction_name);
            let directionID = direction.direction_id;

            acc[directionID] = directionName;
            return acc;
        }, {});
        skeleton.directions = directions;

        directionLocks[ptvRouteID].emit('loaded', directions);
        delete directionLocks[ptvRouteID];

        callback(skeleton);
    });
}

function loadStops(skeleton, callback) {
    let id = skeleton.ptvRouteID,
        downDirection = Object.keys(skeleton.directions).sort((a, b) => b - a)[0];

    if (serviceLocks[id]) {
        return serviceLocks[id].on('loaded', stations => {
            skeleton.stations = stations;
            callback(skeleton);
        });
    }

    if (stopsCache.get(id)) {
        return callback(stopsCache.get(id));
    }

    serviceLocks[id] = new EventEmitter();
    serviceLocks[id].setMaxListeners(30);

    ptvAPI.makeRequest('/v3/stops/route/' + id + '/route_type/0?direction_id=' + downDirection, (err, data) => {
        skeleton.stations = data.stops.sort((a, b) => a.stop_sequence - b.stop_sequence).map(trainStation => {
            trainStation.stop_name = trainStation.stop_name.replace('Station', 'Railway Station');
            return {
                stationID: trainStation.stop_id,
                stationName: trainStation.stop_name,
                cleanStationName: trainStation.stop_name.slice(0, -16).toLowerCase().replace(/ /g, '-'),
                suburb: trainStation.stop_suburb,
                stopNumber: trainStation.stop_sequence
            }
        });
        skeleton.skeleton = false;

        serviceLocks[id].emit('loaded', skeleton);
        delete serviceLocks[id];

        stopsCache.put(id, skeleton);
        callback(skeleton);
    });
}

function loadTrainLineDataIfNeeded(trainLine, db, callback) {
    function onCompleted(updatedTrainLine) {
        db.getCollection('train lines').updateDocument({ _id: trainLine._id }, {
            $set: updatedTrainLine
        }, err => {
            callback(updatedTrainLine);
        });
    }

    function onBasicCompleted(service) {
        if (!service.frequency) {
            service.frequency = {};
            service.firstLastService = {};

            let directions = Object.keys(service.directions).sort((a, b) => b - a);
            let promises = [];

            let upDirection = directions[1];

            directions.forEach((directionID, isUp) => {
                let directionName = service.directions[directionID];

                promises.push(new Promise(resolve => {
                    let firstStop = (isUp ? service.stations[service.stations.length - 1] // last station
                                    : service.stations[upDirection == 1 ? 5 : 0]).stationID; // first stn out of loop

                    getFrequency(service.ptvRouteID, 0, firstStop, directionID, db, frequency => {
                        getFirstLastService(service.ptvRouteID, 0, firstStop, directionID, db, firstLastService => {
                            service.frequency[directionName] = frequency;
                            service.firstLastService[directionName] = firstLastService;

                            resolve();
                        });
                    });
                }));
            });

            Promise.all(promises).then(() => {
                onCompleted(service);
            })
        } else onCompleted(service)
    }

    if (!Object.keys(trainLine.directions).length)
        loadDirections(trainLine, _ => {
            loadStops(_, updatedTrainLine => {
                onBasicCompleted(updatedTrainLine);
            });
        });
    else if (!trainLine.stations.length)
        loadStops(trainLine, updatedTrainLine => {
            onBasicCompleted(updatedTrainLine);
        });
    else
        onBasicCompleted(trainLine);
}

module.exports = {
    getTrainLine,
    loadTrainLineDataIfNeeded
}
