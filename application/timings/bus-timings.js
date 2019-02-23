const ptvAPI = require('../../utils/ptv-api');
const {queryServiceData} = require('../../utils/bus-service');
const TimedCache = require('timed-cache');

let timingsCache = new TimedCache({ defaultTtl: 1000 * 60 * 1.5 });

function getServiceInfo(serviceID, directionID, db, callback) {
    queryServiceData({ ptvRouteID: serviceID }, db, services => {
        callback(services.filter(service => service.directionID == directionID)[0]);
    })
}

function getTimings(busStopCode, db, callback) {
    if (timingsCache.get(busStopCode)) {
        callback(timingsCache.get(busStopCode));
        return;
    }

    let promises = [];
    let timings = {};
    let services = {};

    ptvAPI.makeRequest('/v3/departures/route_type/2/stop/' + busStopCode, (err, data) => {
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

                    timings[serviceData.fullService] = timings[serviceData.fullService] || {};
                    timings[serviceData.fullService][serviceData.destination] = timings[serviceData.fullService][serviceData.destination] || [];

                    if (new Date() - arrivalTime > 0) {
                        resolve();
                        return;
                    }

                    timings[serviceData.fullService][serviceData.destination].push({
                        service: serviceData.fullService,
                        destination: serviceData.destination,
                        arrivalTime
                    });

                    timings[serviceData.fullService][serviceData.destination] =
                        timings[serviceData.fullService][serviceData.destination].sort((a,b) => a.arrivalTime - b.arrivalTime);

                    resolve();
                }

                let serviceID = departure.route_id + '-' + departure.direction_id;
                let serviceData = services[serviceID];

                if (!serviceData) {
                    getServiceInfo(departure.route_id, departure.direction_id, db, serviceData => {
                        services[serviceID] = serviceData;
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

module.exports = { getTimings };
