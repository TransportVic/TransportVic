const ptvAPI = require('../../utils/ptv-api');
const {queryServiceData} = require('../../utils/tram-service');
const TimedCache = require('timed-cache');
const EventEmitter = require('events');

let timingsCache = new TimedCache({ defaultTtl: 1000 * 60 * 1 });
let locks = {};

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

        callback(serviceData);

        locks[id].emit('loaded', serviceData);
        delete locks[id];
    })
}

function getTimingsForTramStop(tramStopID, db, callback) {
    if (timingsCache.get(tramStopID)) {
        callback(timingsCache.get(tramStopID));
        return;
    }

    ptvAPI.makeRequest('/v3/departures/route_type/1/stop/' + tramStopID + '?max_results=6&expand=run', (err, data) => {
        let timings = {};
        let promises = [];

        let services = [];
        data.departures.forEach(departure => {
            promises.push(new Promise(resolve => {
                getServiceInfo(departure.route_id, departure.direction_id, db, serviceData => {
                    let arrivalTime = departure.estimated_departure_utc || departure.scheduled_departure_utc;
                    arrivalTime = new Date(arrivalTime);

                    timings[serviceData.serviceNumber] = timings[serviceData.serviceNumber] || {};
                    timings[serviceData.serviceNumber][serviceData.destination] = timings[serviceData.serviceNumber][serviceData.destination] || [];

                    let headwayDeviance = null;

                    if (departure.estimated_departure_utc) {
                        headwayDeviance = (new Date(departure.scheduled_departure_utc) - new Date(departure.estimated_departure_utc)) / 1000;
                    }

                    let lastStop = serviceData.stops.slice(-1)[0];
                    db.getCollection('tram stops').findDocument({
                        cleanTramStopName: lastStop.tramStopName.trim().replace(/[^\w]/g, '-').replace(/-+/g, '-').toLowerCase(),
                        suburb: lastStop.suburb
                    }, (err, destinationTramStop) => {
                        timings[serviceData.serviceNumber][serviceData.destination].push({
                            service: serviceData.serviceNumber === '3-3a' ? '3' : serviceData.serviceNumber,
                            destination: destinationTramStop,
                            arrivalTime,
                            headwayDeviance
                        });

                        timings[serviceData.serviceNumber][serviceData.destination] =
                            timings[serviceData.serviceNumber][serviceData.destination].sort((a,b) => a.arrivalTime - b.arrivalTime);

                        resolve();
                    });
                });
            }));
        });


        Promise.all(promises).then(() => {
            timingsCache.put(tramStopID, timings);
            callback(timings);
        });
    });
}


function getTimings(tramStopCodes, db, callback) {
    let promises = [];
    let allStopsTimings = [];
    tramStopCodes.forEach((tramStopCode, i) => {
        promises.push(new Promise(resolve => {
            setTimeout(() => {
                getTimingsForTramStop(tramStopCode, db, timings => {
                    allStopsTimings.push(timings);

                    resolve();
                });
            }, i * 100);
        }));
    });


    Promise.all(promises).then(() => {
        let finalTimings = {};

        allStopsTimings.forEach(stopTimings => {
            Object.keys(stopTimings).forEach(service => {
                if (finalTimings[service]) {
                    finalTimings[service] = Object.assign(finalTimings[service], stopTimings[service]);
                } else {
                    finalTimings[service] = stopTimings[service];
                }
            });
        });

        callback(finalTimings);
    });
}

module.exports = {
    getTimings
}
