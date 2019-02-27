const DatabaseConnection = require('../application/database/DatabaseConnection');
const metroTrainStations = require('./metro-train-stations.json').features;
const config = require('../config.json');
const crypto = require('crypto');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let trainStations = null;

let promises = [];

function hashTrainStation(trainStation) {
    let hash = crypto.createHash('sha1');
    hash.update(trainStation.stationName + trainStation.suburb);

    return hash.digest('hex').slice(0, 6);
}

function transformTrainStation(inputTrainStation) {
    let stationNameData = inputTrainStation.properties.STOP_NAME.match(/([^\(]+) \((.+)+\)/);
    if (!stationNameData) stationNameData = [inputTrainStation.properties.STOP_NAME, ''];

    return {
        stationName: stationNameData[1],
        suburb: stationNameData[2],
        mykiZones: inputTrainStation.properties.TICKETZONE.split(','),
        trainLines: inputTrainStation.properties.ROUTEUSSP.split(','),

        location: {
            type: "MultiPoint",
            coordinates: [
                [inputTrainStation.properties.LONGITUDE,
                inputTrainStation.properties.LATITUDE]
            ]
        },
        trainStationID: 0
    }
}

let transformedStations = metroTrainStations.map(transformTrainStation);

database.connect({
    poolSize: 100
}, (err) => {
    trainStations = database.getCollection('train stations');
    trainStations.createIndex({ location: "2dsphere", stationName: 1 });

    transformedStations.forEach(station => {
        promises.push(new Promise(resolve => {
            station.bookmarkCode = hashTrainStation(station);

            trainStations.countDocuments({ stationName: station.stationName, suburb: station.suburb }, (err, present) => {
                if (present) {
                    trainStations.updateDocument({ stationName: station.stationName, suburb: station.suburb }, {
                        $set: station
                    }, resolve);
                } else {
                    trainStations.createDocument(station, resolve);
                }
            });
        }));
    });

    Promise.all(promises).then(() => {
        console.log('Loaded ' + promises.length + ' train stations');
        process.exit();
    });
});
