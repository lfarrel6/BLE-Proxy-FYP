var noble             = require('noble')
  , coap              = require('coap')
  , async             = require('async')
  , server            = coap.createServer()
  , discoveries       = []
  , proximity_timeout = 2000; //if a discovery is out of range after 2000 milliseconds, delete it from our list

server.on('request', function(req, res){
	console.log(req.method + ' request');

	switch(req.method){
		case 'GET':
			console.log('Request URL: ' + req.url);
			console.log('Split URL: ' + req.url.split('/'));

			var args = req.url.split('/');

			if(args.length > 1){

				var id = args[1];
				console.log('ID requested: ' + id);

				var avail = getPeripheral(id);
				console.log('Peripheral found successfully? ' + (avail == 0));

				if(avail == 0){
					res = getInformation(id, res);	
				}
				requestComplete(res, avail);
			}else{
				// return all discoveries
				for(var discovered in discoveries){
					res.write(discovered.info + '\n');
				}
				requestComplete(res, 0);
			}

			break;
		//case    'PUT':
		//case   'POST':
		//case 'DELETE':
		default:
			res.write('Sorry, the server is not yet configured for ' + req.method + ' requests.');
			res.end('\n');
			break;
	}
});

function getPeripheral(id){
	var inRange;
	inRange = discoveries[id];

	if(inRange){ return 0; }
	return 2;
}

function getInformation(id, res){
	var requestedPeripheral = discoveries[id].peripheral;

	requestedPeripheral.on('disconnect', function(){
		console.log('> Requested Peripheral disconnect');
		res.write('Peripheral disconnect @ ' + Date.now());
	});

	requestedPeripheral.connect(function(err){
		requestedPeripheral.discoverServices([], function(error, services){
			var i = 0;

			async.whilst(
				function(){ return i < services.length; },
				function(callback){
					var service = services[serviceIndex];
			        var serviceInfo = service.uuid;

			        if (service.name) {
			          serviceInfo += ' (' + service.name + ')';
			        }
			        console.log('> ' + serviceInfo);
			        res.write('#' + i + ': ' + serviceInfo + '\n');
			        i++;
				},
				function(err){ requestedPeripheral.disconnect(); }
			);
		});
	});
	return res;
}

function requestComplete(response, status){
	if(status == 0){
		response.code = '2.01'; // message code complies with CoAP standards (success)
	}else if(status == 1){
		response.code = '4.01'; // message code complies with CoAP standards (client failure)
	}else{
		response.code = '5.01'; // message code complies with CoAP standards (client failure)
	}
	response.end('\n');
}

//Provide coap port
server.listen(5683, function(){
	console.log('Server started.')
});

/**
Noble code below - current functionality maintains a list of devices in proximity, removing after a 2000ms time interval if they haven't been seen 
**/

noble.on('stateChange', function(state){
	console.log('State Change Event... ', state);
	if(state === 'poweredOn'){
		//Search for any uuid, don't accept duplicates
		noble.startScanning([], false);
	} else{ 
		noble.stopScanning();
	}
});

noble.on('scanStart', function(){
	console.log('> Scanning...');
});

noble.on('scanStop', function(){
	console.log('> Stopping Scanning...');
});

//discover function used to maintain list of surrounding devices (i.e. discoveries)
noble.on('discover', function(peripheral){
	console.log('> Peripheral Discovered');

	var id = peripheral.id;

	//if discovery is new
	if(!discoveries[id]){
		var peripheralInfo = peripheral.id + ' (' + peripheral.advertisement.localName + ')';
		discoveries[id] = {
			peripheral: peripheral,
			info: peripheralInfo
		};
		console.log('> New peripheral discovered: ' + peripheral.advertisement.localName + ' @ ' + new Date());
	}

	discoveries[id].lastSeen = Date.now();
});

setInterval(function(){
	for(var id in discoveries){
		if(discoveries[id].lastSeen < (Date.now() - proximity_timeout)){
			console.log('> Lost peripheral ' + discoveries[id].info);

			delete(discoveries[id]);
		}
	}
}, proximity_timeout/2); //check list every 1000ms to see if devices have been lost