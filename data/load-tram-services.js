const DatabaseConnection = require('../application/database/DatabaseConnection');
const metroTramServices = require('./data/metro-tram-services.json').features;
const config = require('../config.json');
const ptvAPI = require('../utils/ptv-api');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let tramServices = null;

let promises = [];
let allServices = [];
let routeIDs = {};

function findBestServices(serviceServices) {
    let max = 2;

    let directions = serviceServices.reduce((acc, svc) => {
        acc[svc.properties.TRIPHDSIGN] = acc[svc.properties.TRIPHDSIGN] || [];
        acc[svc.properties.TRIPHDSIGN].push(svc);

        return acc;
    }, {});

    return Object.keys(directions).map((directionName) => {
        return Object.values(directions[directionName].reduce((acc, svc) => {
            acc[svc.properties.ROUTE_KM] = svc;
            return acc
        }, {})).sort((a, b) => b.properties.ROUTE_KM - a.properties.ROUTE_KM)[0];
    });
}

function getAllTramServices(data) {
    return data.reduce((acc, service) => acc.concat(service.properties.ROUTESHTNM), []).filter((e, i, a) => a.indexOf(e) == i);
}

function adjustDestination(destination) {
    if (destination == 'Flinders Street Station, City') {
        destination = 'Flinders Street Station (City)';
    }

    return destination;
}

function transformTramService(inputTramService) {
    return {
        serviceNumber: inputTramService.properties.ROUTESHTNM.replace('/', '-'),
        operator: inputTramService.properties.OPERATOR,
        destination: adjustDestination(inputTramService.properties.TRIPHDSIGN.match(/(.+) to /)[1]),
        ptvRouteID: 0,

        stops: [],
        lastUpdated: new Date(),
        skeleton: true
    }
}

function loadRouteIDs(callback) {
    ptvAPI.makeRequest('/v3/routes?route_types=1', (err, data) => {
        data.routes.forEach(routeData => {
            routeIDs[routeData.route_number] = routeData.route_id;
        });

        callback();
    });
}

getAllTramServices(metroTramServices).forEach(e => {
    allServices.push(findBestServices(metroTramServices.filter(f=>f.properties.ROUTESHTNM == e)).map(service => {
        return transformTramService(service);
    }));
});

database.connect({
    poolSize: 100
}, (err) => {
    tramServices = database.getCollection('tram services');
    tramServices.createIndex({ serviceNumber: 1, destination: 1 });

    loadRouteIDs(() => {
        allServices.forEach(serviceDirections => {
            serviceDirections.forEach(direction => {
                promises.push(new Promise(resolve => {
                    direction.ptvRouteID = routeIDs[direction.serviceNumber];

                    tramServices.countDocuments({ serviceNumber: direction.serviceNumber }, (err, present) => {
                        if (present == 2) {
                            if (new Date() - (direction.lastUpdated || new Date()) < 1000 * 60 * 60 * 24 * 7) { // last update less than a week
                                delete direction.stops;
                                delete direction.ptvRouteID;
                            }

                            tramServices.updateDocument({ serviceNumber: direction.serviceNumber }, {
                                $set: direction
                            }, resolve);
                        } else {
                            tramServices.createDocument(direction, resolve);
                        }
                    });
                }));
            });
        });

        Promise.all(promises).then(() => {
            console.log('Loaded ' + promises.length + ' tram services');
            process.exit();
        });
    });
});
