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

	var coapReq = coap.request('coap://'+ipAddr+':5683/.well-known/core');
	
	var responseValue;

	coapReq.on('response',function(coapRes){

		coapRes.setEncoding('utf8');

		coapRes.on('data',function(chunk){
			console.log('BODY: ' + chunk);
			responseValue+=chunk;
		});
		
		coapRes.on('end', function(){
			res.json(responseValue);
			//res.end();
		});

	});
	coapReq.end();
	console.log('request finished\n'+responseValue);
	//res.send(responseValue);
});

module.exports = router;