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
	//console.log(coapReq);
	var responseValue;

	for(var i = 0; i < 25; i++){
		responseValue+=''+i+'\n';
		console.log(i);
	}

	coapReq.on('response',function(coapRes){

		coapRes.on('data',function(chunk){
			console.log(chunk);
			//responseValue+=chunk + ' ';
			//res.append(chunk);
		});
		
		coapRes.on('end', function(){
			console.log('message complete: ', responseValue);
			console.log('Response:', res);
			res.end();
		});

	});
	coapReq.end();
	console.log('request finished\n'+responseValue);
	res.send(responseValue);
});

module.exports = router;