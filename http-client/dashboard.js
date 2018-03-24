var express = require('express');
var router = express.Router();
var coap = require('coap');
var path = require('path');

var ipAddr;

router.get('/:ip', function(req,res){
	res.sendFile(path.join(__dirname, '/public/pages/dash.html'));
});

router.get('/:ip/observations',function(req,res){
	ipAddr = req.params.ip;

	console.log('SENDING COAP REQUEST');

	var coapReq = coap.request('coap://'+ipAddr+':5683/.well-known/core');
	
	var responseValue;

	coapReq.on('response',function(coapRes){

		console.log("COAP RESPONSE: " + JSON.stringify(coapRes));

		console.log('MESSAGE CODE: ' + coapRes.code);

		coapRes.setEncoding('utf8');

		console.log("PAYLOAD: " + coapRes.payload);

		coapRes.on('data',function(chunk){

			console.log('CHUNK TYPE: ' + chunk.constructor.name);

			res.write(chunk);
		});
		
		coapRes.on('end', function(){
			console.log('COAP RESPONSE COMPLETE');
			res.end();
		});

	});
	coapReq.end();
	
});

router.get('/:ip/:device',function(req,res){
	res.sendFile(path.join(__dirname, '/public/pages/device-interface.html'));
});

router.get('/:ip/:device/exp',function(req,res){
	if(!ipAddr){
		ipAddr = req.params.ip;
	}
	var deviceID = req.params.device;

	console.log('SENDING DEVICE EXPLORE REQUEST');

	var coapReq = coap.request('coap://'+ipAddr+':5683/'+deviceID+'/exp');
	coapReq.on('response', function(coapRes){

		coapRes.setEncoding('utf8');

		coapRes.on('data', function(chunk){
			res.write(chunk);
		});

		coapRes.on('end', function(){
			res.end();
		});

	});

	coapReq.end();
});

module.exports = router;