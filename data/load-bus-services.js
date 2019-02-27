const DatabaseConnection = require('../application/database/DatabaseConnection');
const metroBusServices = require('./data/metro-bus-services.json').features;
const config = require('../config.json');
const { getServiceNumber, getServiceVariant, adjustDestination } = require('../utils/bus-service');
const ptvAPI = require('../utils/ptv-api');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let busServices = null;

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

function getAllBusServices(data) {
    return data.reduce((acc, service) => acc.concat(service.properties.ROUTESHTNM), []).filter((e, i, a) => a.indexOf(e) == i);
}

function fixOperator(operator) {
    operator = operator.trim();

    if (operator === 'CDC') return 'CDC Melbourne';
    if (operator.includes('Ventura')) return 'Ventura Bus Lines';
    if (operator === 'Transdev') return 'Transdev Melbourne';

    return operator;
}

function transformBusService(inputBusService, serviceType) {
    if (inputBusService.properties.ROUTESHTNM.toLowerCase().includes('telebus')) {
        serviceType = 'telebus';
        inputBusService.properties.OPERATOR = 'Ventura Bus Lines';
    }

    return {
        fullService: inputBusService.properties.ROUTESHTNM,
        serviceNumber: getServiceNumber(inputBusService.properties.ROUTESHTNM),
        serviceVariant: getServiceVariant(inputBusService.properties.ROUTESHTNM),
        operators: inputBusService.properties.OPERATOR.split(',').map(fixOperator),
        serviceType: serviceType || 'metro',
        destination: adjustDestination(inputBusService.properties.TRIPHDSIGN),
        directionID: 0,
        ptvRouteID: 0,

        stops: [],
        lastUpdated: new Date(),
        skeleton: true,
        gtfsID: serviceType === 'telebus' ? '7-TB' + getServiceVariant(inputBusService.properties.ROUTESHTNM) : inputBusService.properties.ROUTE_ID.match(/(\d-\w+)/)[1]
    }
}

function loadRouteIDs(callback) {
    ptvAPI.makeRequest('/v3/routes', (err, data) => {
        data.routes.forEach(routeData => {
            routeIDs[routeData.route_number] = routeData.route_id;
            routeIDs[routeData.route_gtfs_id] = routeData.route_id;
        });

        callback();
    });
}

getAllBusServices(metroBusServices).forEach(e=>{
    allServices.push(findBestServices(metroBusServices.filter(f=>f.properties.ROUTESHTNM == e)).map(service => {
        return transformBusService(service, 'metro');
    }));
});

database.connect({
    poolSize: 100
}, (err) => {
    busServices = database.getCollection('bus services');

    loadRouteIDs(() => {
        allServices.forEach(serviceDirections => {
            serviceDirections.forEach(direction => {
                promises.push(new Promise(resolve => {
                    if (direction.serviceType === 'telebus')
                        direction.gtfsID = '7-TB' + direction.serviceVariant;

                    if (!routeIDs[direction.gtfsID]) console.log(direction.fullService)
                    direction.ptvRouteID = routeIDs[direction.gtfsID] || routeIDs[direction.fullService];

                    busServices.countDocuments({ fullService: direction.fullService, destination: direction.destination }, (err, present) => {
                        if (present) {
                            delete direction.directionID;
                            delete direction.stops;

                            busServices.updateDocument({ fullService: direction.fullService, destination: direction.destination }, {
                                $set: direction
                            }, resolve);
                        } else {
                            busServices.createDocument(direction, resolve);
                        }
                    });
                }));
            });
        });

        Promise.all(promises).then(() => {
            loadRouteIDs(() => {
                console.log('Loaded ' + promises.length + ' bus services');
                process.exit();
            });
        });
    });
});
