const express = require('express');
const {queryServiceData} = require('../../../utils/bus-service');
const router = new express.Router();

function flattenDest(dest) {
    return dest.replace(/[^\w]/g, '-').replace(/--+/g, '-').replace(/^-*/, '').replace(/-*$/, '').toLowerCase();
}

router.get('/:fullService', (req, res) => {
    queryServiceData(req.params, res.db, service => {
        if (service.length == 2 && service[0].directionID == service[1].directionID)
            service = service.sort((a,b)=>a.destination.length - b.destination.length);
        else
            service = service.sort((a,b)=>a.directionID - b.directionID);

        res.redirect('/bus/metro/' + req.params.fullService + '/' + flattenDest(service[0].destination));
    })
});

router.get('/:fullService/:destination', (req, res, next) => {
    queryServiceData({
        fullService: req.params.fullService
    }, res.db, service => {
        service = service.sort(direction => flattenDest(direction.destination) === req.params.destination ? -1 : 1);
        if (!service[0]) next();
        else {
            let data = {service: service[0]};
            if (service.length == 2) {
                data.otherDest = service[1].destination;
            }

            let termini = [service[0].stops[0], (service[1] || service[0]).stops[0]];
            res.db.getCollection('bus stops').findDocuments({
                $or: termini.map(busStop => {return {
                    busStopName: new RegExp(busStop.busStopName.replace(/([*+?])/g, '\\$1'), 'i'),
                    suburb: busStop.suburb
                }})
            }).toArray((err, termini) => {
                data.termini = termini.sort(terminus => terminus.busStopName === termini[0] ? -1 : 1);
                res.render('service-info/metro-bus', data);
            });
        }
    })
});

module.exports = router;
