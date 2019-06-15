const DatabaseConnection = require('../application/database/DatabaseConnection');
const config = require('../config.json');
const ptvAPI = require('../utils/ptv-api');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let trainLines = null;

let promises = [];

function transformTrainLine(inputTrainLine) {
    if (inputTrainLine.route_name == 'Showgrounds - Flemington Racecourse') {
        inputTrainLine.route_name = 'Showgrounds & Flemington';
    }

    return {
        lineName: inputTrainLine.route_name,
        cleanLineName: inputTrainLine.route_name.toLowerCase().replace(/[ &]/g, '-').replace(/--+/g, '-'),
        ptvRouteID: inputTrainLine.route_id,

        stations: [],
        skeleton: true,
        directions: {},
        operator: 'Metro Trains',
        lastUpdated: new Date()
    }
}
function loadTrainLines(callback) {
    ptvAPI.makeRequest('/v3/routes?route_types=0', (err, data) => {
        let trainLines = data.routes.filter(route => route.route_type == 0).map(transformTrainLine);
        callback(trainLines);
    });
}

database.connect({
    poolSize: 100
}, (err) => {
    trainStations = database.getCollection('train lines');
    trainStations.createIndex({ lineName: 1 });

    loadTrainLines(trainLines => {
        trainLines.forEach(trainLine => {
            promises.push(new Promise(resolve => {
                trainStations.countDocuments({ lineName: trainLine.lineName }, (err, present) => {
                    if (present) {
                        if (new Date() - (trainLine.lastUpdated || new Date()) < 1000 * 60 * 60 * 24 * 7) { // last update less than a week
                            delete trainLine.directions;
                            delete trainLine.stations;
                            trainLine.skeleton = false;
                        }

                        trainStations.updateDocument({ lineName: trainLine.lineName }, {
                            $set: trainLine
                        }, resolve);
                    } else {
                        trainStations.createDocument(trainLine, resolve);
                    }
                });
            }));
        });

        Promise.all(promises).then(() => {
            console.log('Loaded ' + promises.length + ' train lines');
            process.exit();
        });
    });
});
