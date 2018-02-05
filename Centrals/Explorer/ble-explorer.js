var noble             = require('noble')
  , coap              = require('coap')
  , server            = coap.createServer()
  , discoveries       = []
  , proximity_timeout = 2000; //if a discovery is out of range after 2000 milliseconds, delete it from our list

server.on('request', function(req, res){
	console.log(req.method + ' request');

	switch(req.method){
		case 'GET':
			console.log('Request URL: ' + req.url);
			console.log('Split URL: ' + req.url.split('/'));

			var id = req.url.split('/')[1];
			console.log('ID requested: ' + id);

			var avail = getPeripheral(id);
			console.log('Peripheral found successfully? ' + avail);

			requestComplete(res, avail);

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

	if(inRange){ return true; }
	return false;
}

function requestComplete(response, available){
	if(available){
		response.code = '2.01'; // message code complies with CoAP standards (success)
		response.write('Device located successfully');
	}else{
		response.code = '5.01'; // message code complies with CoAP standards (server failure)
		response.write('Device not found');
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
		discoveries[id] = {
			peripheral: peripheral
		};
		console.log('> New peripheral discovered: ' + peripheral.advertisement.localName + ' @ ' + new Date());
	}

	discoveries[id].lastSeen = Date.now();
});

setInterval(function(){
	for(var id in discoveries){
		if(discoveries[id].lastSeen < (Date.now() - proximity_timeout)){
			console.log('> Lost peripheral (' + discoveries[id].peripheral.advertisement.localName + ')');

			delete(discoveries[id]);
		}
	}
}, proximity_timeout/2); //check list every 1000ms to see if devices have been lost