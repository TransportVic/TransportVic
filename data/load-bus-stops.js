const DatabaseConnection = require('../application/database/DatabaseConnection');
const metroBusStops = require('./metro-bus-stops.json').features;
const config = require('../config.json');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let busStops = null;

let promises = [];

function transformBusStop(inputBusStop) {
    let stopNameData = inputBusStop.properties.STOP_NAME.match(/([^\(]+) \((.+)+\)/);
    if (!stopNameData) stopNameData = [inputBusStop.properties.STOP_NAME, '']

    return {
        gtfsBusStopCodes: [inputBusStop.properties.STOP_ID],
        busStopName: stopNameData[1],
        suburb: stopNameData[2],
        mykiZones: inputBusStop.properties.TICKETZONE.split(','),
        routes: inputBusStop.properties.ROUTEUSSP.split(','),

        location: {
            type: "MultiPoint",
            coordinates: [
                [inputBusStop.properties.LONGITUDE,
                inputBusStop.properties.LATITUDE]
            ]
        },
        busStopCode: 0
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

let transformedStops = Object.values(mergeBusStops(metroBusStops).map(transformBusStop).reduce((acc, busStop) => {
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

    transformedStops.forEach(stop => {
        promises.push(new Promise(resolve => {
            busStops.countDocuments({ busStopName: stop.busStopName, suburb: stop.suburb }, (err, present) => {
                if (present) {
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
