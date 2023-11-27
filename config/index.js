"use strict";


var env = process.env.NODE_ENV || 'dev';
var cfg = require(`./config.${env}.js`);


module.exports = cfg;

