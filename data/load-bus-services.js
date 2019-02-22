const DatabaseConnection = require('../application/database/DatabaseConnection');
const metroBusServices = require('./metro-bus-services.json').features;
const config = require('../config.json');
const { getServiceNumber, getServiceVariant, adjustDestination } = require('../utils/bus-service');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let busServices = null;

let promises = [];
let allServices = [];

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

function transformBusServices(inputBusServices, routeType) {
    if (inputBusServices.properties.ROUTESHTNM.toLowerCase().includes('telebus')) {
        routeType = 'telebus';
        inputBusServices.properties.OPERATOR = 'Ventura Bus Lines';
    }

    return {
        fullService: inputBusServices.properties.ROUTESHTNM,
        serviceNumber: getServiceNumber(inputBusServices.properties.ROUTESHTNM),
        serviceVariant: getServiceVariant(inputBusServices.properties.ROUTESHTNM),
        operators: inputBusServices.properties.OPERATOR.split(',').map(fixOperator),
        routeType: routeType || 'metro',
        destination: adjustDestination(inputBusServices.properties.TRIPHDSIGN),
        directionID: 0,
        interchanges: [],
        ptvRouteID: 0,

        stops: [],
        lastUpdated: new Date()
    }
}

getAllBusServices(metroBusServices).forEach(e=>{
    allServices.push(findBestServices(metroBusServices.filter(f=>f.properties.ROUTESHTNM == e)).map(transformBusServices));
});


database.connect({
    poolSize: 100
}, (err) => {
    busServices = database.getCollection('bus services');

    allServices.forEach(serviceDirections => {
        serviceDirections.forEach(direction => {
            promises.push(new Promise(resolve => {
                busServices.countDocuments({ fullService: direction.fullService, destination: direction.destination }, (err, present) => {
                    if (present) {
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
        console.log('Loaded ' + promises.length + ' bus services');
        process.exit();
    });
});
