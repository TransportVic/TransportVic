const ptvAPI = require('./ptv-api');

function populateStationData(trainStation, callback) {
    ptvAPI.makeRequest(`/v3/stops/${trainStation.gtfsTrainStationCode}/route_type/0?gtfs=true`, (err, data) => {
        let stopData = data.stop;
        trainStation.ptvTrainStationID = stopData.stop_id;

        callback(trainStation);
    });
}

function updateTrainStationIfNeeded(trainStation, db, callback) {
    if (!trainStation.ptvTrainStationID) {
        populateStationData(trainStation, updatedTrainStation => {
            db.getCollection('train stations').updateDocument({_id: trainStation._id}, { $set: updatedTrainStation }, () => {
                callback(updatedTrainStation);
            });
        });
    } else {
        callback(trainStation);
    }
}

function updateTrainStationsAsNeeded(trainStations, db, callback) {
    let promises = [];
    let finalTrainStations = [];

    trainStations.forEach(trainStation => {
        promises.push(new Promise(resolve => {
            updateTrainStationIfNeeded(trainStation, db, updatedTrainStation => {
                finalTrainStations.push(updatedTrainStation);
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => callback(finalTrainStations));
}

function getTrainStation(stationName, db, callback) {
    db.getCollection('train stations').findDocument({ stationName }, (err, trainStation) => {
        if (!trainStation) {
            callback(null);
            return;
        }

        updateTrainStationIfNeeded(trainStation, db, callback);
    });
}

module.exports = {
    getTrainStation,
    updateTrainStationsAsNeeded
};
