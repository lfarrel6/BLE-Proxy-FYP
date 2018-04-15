var express = require('express');
var router = express.Router();
var coap = require('coap');
var path = require('path');
var fs = require('fs');
var devices = [];
var connectionStates = {};
var websocketStream = require('websocket-stream/stream');

router.get('/:ip', function(req,res){
	res.sendFile(path.join(__dirname, '/public/pages/dash.html'));
});

router.ws('/:ip/observations', function(ws,req){

	var streaming = true;
	var ipAddr = req.params.ip;
	if(!devices[ipAddr])
		devices[ipAddr] = [];
	var coapReq = coap.request({
		host: ipAddr,
		pathname: '.well-known/core',
		observe: true
	});

	try{
		coapReq.on('response', function(coapRes){

			ws.on('close',function(){
				streaming = false;
				console.log('Streaming finished');
				coapRes.close();
				return;
			});

			coapRes.on('data', function(data){
				devices[ipAddr].push(JSON.parse(data.toString()));

				if(streaming){
					try{
						ws.send(data.toString());
					}catch(e){
						console.log(e);
					}
				}

			});

		});
	}catch(e){
		console.log(e);
	}
	coapReq.end();

});

router.get('/:ip/:device',function(req,res){
	var ipAddr = req.params.ip;
	var deviceId = req.params.device;
	var connectReq = coap.request('coap://'+ipAddr+':5683/'+deviceId);

	connectReq.on('response',function(coapRes){
		res.sendFile(path.join(__dirname, '/public/pages/device-interface.html'));
	});
	connectReq.end();

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
			coapRes.close();
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


module.exports = router;