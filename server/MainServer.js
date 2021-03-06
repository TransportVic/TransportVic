const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const path = require('path');
const minify = require('express-minify');
const url = require('url');
const querystring = require('querystring');
const fs = require('fs');

const DatabaseConnection = require('../application/database/DatabaseConnection');

const config = require('../config.json');
let BusTracker
if (config.busTrackerPath)
  BusTracker = require(path.join(config.busTrackerPath, 'server.js'))


module.exports = class MainServer {

    constructor() {
        this.app = express();
        this.initDatabaseConnection(this.app, () => {
            this.configMiddleware(this.app);
            this.configRoutes(this.app);
        });
    }

    initDatabaseConnection(app, callback) {
        let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
        database.connect((err) => {
            database.getCollection('bus services').createIndex({ fullService: 1 });
            database.getCollection('bus stops').createIndex({ location: "2dsphere", busStopName: 1, gtfsBusStopCodes: 1, busStopCodes: 1 });
            database.getCollection('train lines').createIndex({ lineName: 1 });;
            database.getCollection('train stations').createIndex({ location: "2dsphere", stationName: 1 });;
            database.getCollection('tram services').createIndex({ serviceNumber: 1, destination: 1 });;
            database.getCollection('tram stops').createIndex({ location: "2dsphere", tramStopName: 1, tramStopCodes: 1, tramTrackerID: 1 });;

            app.use((req, res, next) => {
                res.db = database;
                next();
            });

            callback();
        });
    }

    configMiddleware(app) {
        let id = 0;
        let stream = fs.createWriteStream('/tmp/log.txt', {flags: 'a'});

        app.use((req, res, next) => {
            let reqURL = req.url + '';
            let start = +new Date();

            let endResponse = res.end;
            res.end = function(x, y, z) {
                endResponse.bind(res, x, y, z)();
                let end = +new Date();

                let diff = end - start;

                if (diff > 5 && !reqURL.startsWith('/static/'))
                    stream.write(req.method + ' ' + reqURL + (res.loggingData ? ' ' + res.loggingData : '') + ' ' + diff + '\n', () => {});
            };

            res.locals.hostname = config.websiteDNSName;

            next();
        });

        app.use(compression());
        app.use(minify());

        app.use('/static', express.static(path.join(__dirname, '../application/static')));

        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());
        app.use(bodyParser.text());

        app.use((req, res, next) => {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000');
            let secureDomain = `http${config.useHTTPS ? 's' : ''}://${config.websiteDNSName}:*`;
            secureDomain += ` http${config.useHTTPS ? 's' : ''}://bus.${config.websiteDNSName}:*`
            secureDomain += ' https://*.mapbox.com/'

            res.setHeader('Content-Security-Policy', `default-src blob: data: ${secureDomain}; script-src 'unsafe-inline' blob: ${secureDomain}; style-src 'unsafe-inline' ${secureDomain}`);
            res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            res.setHeader('X-Xss-Protection', '1; mode=block');
            res.setHeader('X-Content-Type-Options', 'nosniff');

            res.setHeader('Referrer-Policy', 'no-referrer');
            res.setHeader('Feature-Policy', "geolocation 'self'; document-write 'none'; microphone 'none'; camera 'none';");

            next();
        });

        app.set('views', path.join(__dirname, '../application/views'));
        app.set('view engine', 'pug');
        if (process.env['NODE_ENV'] && process.env['NODE_ENV'] === 'prod')
            app.set('view cache', true);
        app.set('x-powered-by', false);
        app.set('strict routing', false);
    }

    configRoutes(app) {
        let routers = {
            Index: '/',
            'timings/Bus': '/bus/timings',
            'timings/Metro': '/metro/timings',
            'timings/Tram': '/tram/timings',

            Search: '/search',
            NearbyPTStops: '/nearby',
            Bookmarks: '/bookmarks',

            'runs/MetroBus': '/bus/runs',

            'service-info/MetroBus': '/bus/metro',
            'service-info/MetroTrain': '/metro'
        };

        Object.keys(routers).forEach(routerName => {
            let router = require(`../application/routes/${routerName}`);
            app.use(routers[routerName], router);
        });

        app.get('/sw.js', (req, res) => {
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(path.join(__dirname, '../application/static/app-content/sw.js'));
        });

        if (BusTracker) {
            app.use('/tracker', BusTracker)
        }

        app.use('/500', (req, res) => {throw new Error('500')});

        app.use((req, res, next) => {
            next(new Error('404'));
        });
        app.use((err, req, res, next) => {
            if (err.message === '404') {
                res.render('error', {code: 404});
            } else {
                res.render('error', {code: 500});

                if (process.env['NODE_ENV'] !== 'prod') {
                    console.log(err);
                }
            }
        });
    }

}
