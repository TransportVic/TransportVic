const DatabaseConnection = require('../application/database/DatabaseConnection');
const metroBusStops = require('./data/metro-bus-stops.json').features;
const config = require('../config.json');
const busStopOverrides = require('./data/bus-stop-override');
const { hashBusStop } = require('../utils/bus-stop');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let busStops = null;

let promises = [];

function transformBusStop(inputBusStop) {
    let stopNameData = inputBusStop.properties.STOP_NAME.match(/^([^\/]+\/.+) \(([\w ]+)\)$/);
    if (!stopNameData) stopNameData = ['', inputBusStop.properties.STOP_NAME, '-TELEBUS'];
    if (stopNameData[1].includes('(')) { // odd names eg Reed (west) Cres/Bond Dr (Taylors Lakes)
        stopNameData[1] = stopNameData[1].replace(/^([\w ]+)\((\w+)\) ([\w ]+)/, '$1$3 - $2');
    }

    let stopID = inputBusStop.properties.STOP_ID;
    let additionalGTFSBSCs = [];

    if (stopID in busStopOverrides) {
        if (busStopOverrides[stopID] == null)
            return null;
        if (busStopOverrides[stopID] instanceof Array)
            additionalGTFSBSCs = busStopOverrides[stopID];
    }

    return {
        gtfsBusStopCodes: [stopID].concat(additionalGTFSBSCs),
        busStopName: stopNameData[1].trim(),
        cleanBusStopName: stopNameData[1].trim().replace(/[^\w]/g, '-').replace(/-+/g, '-').toLowerCase(),

        suburb: stopNameData[2],
        cleanSuburb: stopNameData[2].toLowerCase().replace(/ /g, '-'),

        mykiZones: inputBusStop.properties.TICKETZONE.split(','),
        routes: inputBusStop.properties.ROUTEUSSP.split(','),

        location: {
            type: "MultiPoint",
            coordinates: [
                [inputBusStop.properties.LONGITUDE,
                inputBusStop.properties.LATITUDE]
            ]
        },
        busStopCodes: [],
        lastUpdated: new Date()
    }
}

function mergeBusStops(allBusStops) {
    let final = {};

    allBusStops.forEach(busStop => {
        if (Object.keys(final).includes(busStop.properties.STOP_ID)) {
            final[busStop.properties.STOP_ID].properties.ROUTEUSSP += ',' + busStop.properties.ROUTEUSSP;
            final[busStop.properties.STOP_ID].properties.STOP_NAME =
                [final[busStop.properties.STOP_ID].properties.STOP_NAME, busStop.properties.STOP_NAME]
                .sort((a, b) => b.length - a.length)[0];

            final[busStop.properties.STOP_ID];
        } else {
            final[busStop.properties.STOP_ID] = busStop;
        }
    });

    return Object.values(final);
}

let transformedStops = Object.values(mergeBusStops(metroBusStops.concat(Object.values(busStopOverrides).filter(e => e && !!e.geometry))).map(transformBusStop).reduce((acc, busStop) => {
    if (!busStop) return acc;

    if (acc[busStop.busStopName + busStop.suburb]) {
        let svc = acc[busStop.busStopName + busStop.suburb];

        svc.gtfsBusStopCodes.push(busStop.gtfsBusStopCodes[0]);
        svc.routes = svc.routes.concat(busStop.routes).filter((e, i, a) => a.indexOf(e) == i).sort((a, b) => a*1 - b*1);
        svc.location.coordinates = svc.location.coordinates.concat(busStop.location.coordinates);

        acc[busStop.busStopName + busStop.suburb] = svc;
    } else
        acc[busStop.busStopName + busStop.suburb] = busStop;

    return acc;
}, {}));

database.connect({
    poolSize: 100
}, (err) => {
    busStops = database.getCollection('bus stops');
    busStops.createIndex({ location: "2dsphere", busStopName: 1, gtfsBusStopCodes: 1, busStopCodes: 1 });

    transformedStops.forEach(stop => {
        promises.push(new Promise(resolve => {
            stop.bookmarkCode = hashBusStop(stop);

            busStops.countDocuments({ busStopName: stop.busStopName, suburb: stop.suburb }, (err, present) => {
                if (present) {

                    if (new Date() - (stop.lastUpdated || new Date()) < 1000 * 60 * 60 * 24 * 7) { // last update less than a week
                        delete stop.busStopCodes;
                    }

                    busStops.updateDocument({ busStopName: stop.busStopName, suburb: stop.suburb }, {
                        $set: stop
                    }, resolve);
                } else {
                    busStops.createDocument(stop, resolve);
                }
            });
        }));
    });

    Promise.all(promises).then(() => {
        console.log('Loaded ' + promises.length + ' bus stops');
        process.exit();
    });
});
