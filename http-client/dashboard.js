var express = require('express');
var router = express.Router();
var coap = require('coap');
var path = require('path');
var MQTTClient = require('./MQTTClient');

var clientManager = new MQTTClient();

router.get('/:ip', function(req,res){
	res.sendFile(path.join(__dirname, '/public/pages/dash.html'));
});

router.get('/:ip/observations',function(req,res){
	var ipAddr = req.params.ip;

	console.log(req.query);

	console.log('SENDING COAP REQUEST, ' + req.url);

	var requestUrl = 'coap://'+ipAddr+':5683/.well-known/core';
	
	if(req.query.ind){
		console.log(req.query.ind);
		requestUrl=requestUrl+'/'+req.query.ind;
	}
	console.log(requestUrl);
	var coapReq = coap.request(requestUrl);

	var responseValue;

	coapReq.on('response',function(coapRes){

		console.log("COAP RESPONSE: " + JSON.stringify(coapRes));

		console.log('MESSAGE CODE: ' + coapRes.code);

		coapRes.setEncoding('utf8');

		console.log("PAYLOAD: " + coapRes.payload);
		if(coapRes.payload == "N/A"){
			res.write("N/A");
			res.end();
		}else{

			coapRes.on('data',function(chunk){

				console.log('CHUNK TYPE: ' + chunk.constructor.name);

				res.write(chunk);
			});
		
			coapRes.on('end', function(){
				console.log('COAP RESPONSE COMPLETE');
				res.end();
			});
		}

	});
	coapReq.end();
	
});

router.get('/:ip/:device',function(req,res){
	res.sendFile(path.join(__dirname, '/public/pages/device-interface.html'));
});

router.get('/:ip/:device/exp',function(req,res){
	var ipAddr = req.params.ip;
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

router.get('/:ip/:device/:service/getChars',function(req,res){
	 
	var ipAddr = req.params.ip;
	var deviceID = req.params.device;
	var service = req.params.service;
	console.log('Getting characteristics for ' + service);

	var coapReq = coap.request('coap://' + ipAddr + ':5683/'+deviceID+'/'+service+'/getChars');

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

router.all('/:ip/:device/:service/:char/sub',function(req,res){

	var address = 'mqtt://'+req.params.ip;

	/**SUBSCRIBE TO TOPICS**/
	if(!clientManager.hasClient(address)){
		clientManager.createClient(address,1883);
		clientManager.on('error',(err) => {
			console.log(err);
		});
	}

	clientManager.on('connect',function(){
		clientManager.subscribe(address,req.params.device+'/'+req.params.service+'/'+req.params.char);
		clientManager.on('subscribe',() => {
			console.log('Subscribed')
		});
	});
	clientManager.on('message',function(topic,message){
		console.log(topic.toString() + ': ' + message.toString());
	});

});

router.all('/:ip/:device/:service/:char/unsub',function(req,res){
	var address = 'mqtt://'+req.params.ip;
	if(clientManager.hasClient(address)){
		clientManager.unsubscribe(address,req.params.device+'/'+req.params.service+'/'+req.params.char);
		clientManager.on('unsubscribe',() => {
			console.log('Successfully unsubscribed');
		});
	}
});

module.exports = router;