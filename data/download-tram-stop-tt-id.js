const DatabaseConnection = require('../application/database/DatabaseConnection');
const config = require('../config.json');
const request = require('request');
const fs = require('fs');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let tramServices = null;

let promises = [];

let stops = {};
let serviceByStops = {};

database.connect({
    poolSize: 100
}, (err) => {
    tramServices = database.getCollection('tram services');

    tramServices.distinct('serviceNumber', (err, services) => {
        services = services.map(e => e.match(/(\d+)/)[1]);
        services.forEach((service, i) => {
            for (let j = 0; j < 2; j++) {
                promises.push(new Promise(resolve => {
                    setTimeout(() => {
                        request(`http://tramtracker.com/Controllers/GetStopsByRouteAndDirection.ashx?r=${service}&u=${Boolean(j)}`, (err, resp, body) => {
                            let serviceStops = JSON.parse(body).ResponseObject;
                            serviceStops.map(stop => {
                                let stopNumber = stop.StopName.match(/(\d+\w?)/)[1];
                                let stopName = stop.StopName.match(/\d+\w? ([\w ]+)/);
                                let suburb = stop.Suburb;
                                let tramTrackerID = stop.StopNo;
                                if (!stopName) {
                                    if (tramTrackerID == 2063)
                                        stopName = 'Maroona Rd';
                                } else stopName = stopName[1];

                                stopName = stopName.replace('Road', 'Rd')

                                return {stopNumber, stopName, tramTrackerID, suburb};
                            }).forEach(stop => {
                                stops[JSON.stringify(stop)] = stop;

                                if (!serviceByStops[stop.tramTrackerID]) serviceByStops[stop.tramTrackerID] = [];
                                serviceByStops[stop.tramTrackerID].push(service);
                            });

                            resolve();
                        });
                    }, 250 * (i + j));
                }));
            }
        });

        Promise.all(promises).then(() => {
            let stopData = Object.values(stops);
            stopData = JSON.stringify(stopData.map(stop => {
                stop.services = serviceByStops[stop.tramTrackerID].sort((a, b) => a - b).map(e => {
                    return e === '3' ? '3-3a' : e;
                }).filter((e, i, a) => a.indexOf(e) === i);
                return stop;
            }));

            fs.writeFile('./data/tramtracker-ids.json', stopData, () => {
                console.log('Loaded data for ' + Object.values(stops).length + ' stops');
                process.exit();
            });
        });
    });
});
