var express = require('express');
var router = express.Router();
var coap = require('coap');
var path = require('path');
var fs = require('fs');
var websocketStream = require('websocket-stream/stream');

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

		coapRes.setEncoding('utf8');

		if(coapRes.payload == "N/A"){
			res.write("N/A");
			res.end();
		}else{

			coapRes.on('data',function(chunk){
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

router.get('/:ip/:device/:service/:char/read',function(req,res){
	var ipAddr = req.params.ip;
	var deviceID = req.params.device;
	var service = req.params.service;
	var characteristic = req.params.char;

	var coapUrl = 'coap://'+ipAddr+':5683/'+deviceID+'/'+service+'/'+characteristic+'/read';
	var coapReq = coap.request(coapUrl);

	coapReq.on('response', function(coapRes){

		coapReq.setEncoding('utf8');

		coapRes.on('data',function(chunk){
			res.write(chunk);
		});

		coapRes.on('end',function(){
			res.end();
		});

	});
	coapReq.end();

});

router.ws('/:ip/:device/:service/:char/sub',function(ws,req){
	console.log('Websocket connection received to sub');
	var ipAddr = req.params.ip;
	var deviceID = req.params.device;
	var service = req.params.service;
	var characteristic = req.params.char;
	var streaming = true;


	var coapReqPath = deviceID+'/'+service+'/'+characteristic;
	var coapReq = coap.request({
		host: ipAddr,
		pathname: coapReqPath+'/sub',
		observe: true
	});

	coapReq.on('response', function(coapRes){

		console.log('Streaming data');

		ws.on('close',function(){
			streaming = false;
			console.log('Websocket closed');
			return;
		})

		coapRes.on('data', function(data){
			console.log(data.toString());
			try{
				if(streaming)
					ws.send(data.toString());
			}catch(e){
				console.log(e);
				return;
			}
		});

	});
	coapReq.end();

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