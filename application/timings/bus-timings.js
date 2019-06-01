const ptvAPI = require('../../utils/ptv-api');
const { queryServiceData, resetServiceDirections } = require('../../utils/bus-service');
const TimedCache = require('timed-cache');
const EventEmitter = require('events');

let timingsCache = new TimedCache({ defaultTtl: 1000 * 60 * 1 });
let locks = {};
let services = {};

function getServiceInfo(serviceID, directionID, db, callback) {
    let id = serviceID + '-' + directionID;

    if (locks[id]) {
        locks[id].on('loaded', data => {
            callback(data);
        });
        return;
    }

    locks[id] = new EventEmitter();
    locks[id].setMaxListeners(30);

    queryServiceData({ ptvRouteID: serviceID }, db, loadedServices => {
        let serviceData = loadedServices.filter(service => service.directionID == directionID)[0];

        function onComplete(service) {
            services[id] = service;

            callback(service);

            if (locks[id]) {
                locks[id].emit('loaded', service);
                delete locks[id];
            }
        }

        if (!serviceData) { // likely to be direction updated cos p  t  v
            resetServiceDirections(serviceID, db, serviceData => {
                onComplete(serviceData.filter(service => service.directionID == directionID)[0]);
            });
        } else {
            onComplete(serviceData);
        }
    })
}

function getTimingsForBusStop(busStopCode, db, callback) {
    if (timingsCache.get(busStopCode)) {
        callback(timingsCache.get(busStopCode));
        return;
    }

    let promises = [];
    let timings = {};

    ptvAPI.makeRequest('/v3/departures/route_type/2/stop/' + busStopCode + '?max_results=6', (err, data) => {
        let {departures} = data;

        departures = departures.sort((a, b) => a.direction_id - b.direction_id);

        departures.forEach(departure => {
            promises.push(new Promise(resolve => {
                function transformData() {
                    let serviceData = services[serviceID];
                    if (!serviceData) {
                        resolve();
                        return;
                    }

                    let arrivalTime = departure.estimated_departure_utc || departure.scheduled_departure_utc;
                    arrivalTime = new Date(arrivalTime);

                    if (new Date() - arrivalTime > 1000 * 60 * 1 || arrivalTime - new Date() > 1000 * 60 * 60 * 2) { // bus arrives beyond 2hrs
                        resolve();
                        return;
                    }

                    timings[serviceData.fullService] = timings[serviceData.fullService] || {};
                    timings[serviceData.fullService][serviceData.destination] = timings[serviceData.fullService][serviceData.destination] || [];

                    let headwayDeviance = null

                    if (departure.estimated_departure_utc) {
                        headwayDeviance = (new Date(departure.scheduled_departure_utc) - new Date(departure.estimated_departure_utc)) / 1000;
                    }

                    db.getCollection('bus stops').findDocument({
                        busStopCodes: serviceData.stops.slice(-1)[0].busStopCode
                        }, (err, destinationBusStop) => {
                        timings[serviceData.fullService][serviceData.destination].push({
                            service: serviceData.fullService,
                            destination: destinationBusStop,
                            arrivalTime,
                            headwayDeviance,
                            operators: serviceData.operators,
                            serviceNumber: serviceData.serviceNumber,
                            serviceVariant: serviceData.serviceVariant,
                            runID: departure.run_id
                        });

                        timings[serviceData.fullService][serviceData.destination] =
                            timings[serviceData.fullService][serviceData.destination].sort((a,b) => a.arrivalTime - b.arrivalTime);

                        resolve();
                    });
                }

                let serviceID = departure.route_id + '-' + departure.direction_id;
                let serviceData = services[serviceID];

                if (!serviceData) {
                    getServiceInfo(departure.route_id, departure.direction_id, db, serviceData => {
                        transformData();
                    });
                } else {
                    transformData();
                }
            }));
        });

        Promise.all(promises).then(() => {
            timingsCache.put(busStopCode, timings);
            callback(timings);
        });
    });
}

function getTimings(busStopCodes, db, callback) {
    let promises = [];
    let allTimings = [];
    busStopCodes.forEach((busStopCode, i) => {
        promises.push(new Promise(resolve => {
            setTimeout(() => {
                getTimingsForBusStop(busStopCode, db, timings => {
                    allTimings.push(timings);

                    resolve();
                });
            }, i * 100);
        }));
    });

    Promise.all(promises).then(() => {
        let finalTimings = {};
        allTimings.forEach(busStopTimings => {
            Object.keys(busStopTimings).forEach(service => {
                if (finalTimings[service]) {
                    finalTimings[service] = Object.assign(finalTimings[service], busStopTimings[service]);
                } else {
                    finalTimings[service] = busStopTimings[service];
                }
            });
        });

        callback(finalTimings);
    });
}

module.exports = { getTimings, getServiceInfo };
