var express = require('express');
var router = express.Router();
var coap = require('coap');

var ipAddr;

router.get('/:ip', function(req,res){
	//res.send('GET request to ' + req.params.ip);

	ipAddr = req.params.ip;

	var coapReq = coap.request('coap://'+ipAddr+':5683/.well-known/core');
	console.log(coapReq);
	var responseValue;
	coapReq.on('response',function(coapRes){
		coapRes.on('data',function(chunk){
			console.log(chunk);
			responseValue+=chunk + ' ';
		});
		coapRes.on('end', function(){
			console.log('message complete');
			res.send(responseValue);
		});
	});
	coapReq.end();
	console.log('request finished\n'+responseValue);
});

module.exports = router;