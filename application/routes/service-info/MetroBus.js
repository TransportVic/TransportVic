const express = require('express');
const router = new express.Router();

router.get('/:fullService', (req, res) => {
    res.render('service-info/metro-bus');
});

module.exports = router;
