const ptvAPI = require('../../utils/ptv-api');
const TimedCache = require('timed-cache');

let timingsCache = new TimedCache({ defaultTtl: 1000 * 60 * 1 });
let locks = {};
let services = {};

function getTimings(trainStationID, db, callback) {
    if (timingsCache.get(trainStationID)) {
        callback(timingsCache.get(trainStationID));
        return;
    }

    ptvAPI.makeRequest('/v3/departures/route_type/0/stop/' + trainStationID + '?max_results=6&expand=run', (err, data) => {
        let timings = {};
        let promises = [];

        data.departures.forEach(departure => {
            promises.push(new Promise(resolve => {
                db.getCollection('train lines').findDocument({ ptvRouteID: departure.route_id }, (err, lineData) => {
                    let platform = departure.platform_number;
                    let runData = data.runs[departure.run_id];
                    let destination = runData.destination_name;
                    let arrivalTime = new Date(departure.estimated_departure_utc || departure.scheduled_departure_utc);
                    let reachedPlatform = departure.at_platform;
                    let trainType = (runData.vehicle_descriptor || {}).description;

                    if (new Date() - arrivalTime > 1000 * 60 * 1 || arrivalTime - new Date() > 1000 * 60 * 60 * 3 || platform == null) { // train arrives beyond 3hrs
                        resolve();
                        return;
                    }

                    let headwayDeviance = null

                    if (departure.estimated_departure_utc) {
                        headwayDeviance = (new Date(departure.scheduled_departure_utc) - new Date(departure.estimated_departure_utc)) / 1000;
                    }

                    timings[platform] = timings[platform] || {};
                    timings[platform][lineData.lineName] = timings[platform][lineData.lineName] || {};
                    timings[platform][lineData.lineName][destination] = timings[platform][lineData.lineName][destination] || [];
                    timings[platform][lineData.lineName][destination].push({
                        trainLine: lineData.lineName,
                        destination,
                        arrivalTime,
                        headwayDeviance,
                        reachedPlatform,
                        trainType,
                        hasExpress: !!runData.express_stop_count
                    });

                    timings[platform][lineData.lineName][destination] =
                        timings[platform][lineData.lineName][destination].sort((a, b) => a.arrivalTime - b.arrivalTime)

                    resolve();
                });
            }));
        });

        Promise.all(promises).then(() => {
            timingsCache.put(trainStationID, timings);
            callback(timings);
        });
    });
}


module.exports = { getTimings };
