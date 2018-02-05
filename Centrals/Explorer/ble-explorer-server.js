var noble       = require('noble')
  , coap        = require('coap')
  , server      = coap.createServer()
  , discoveries = new Set();

server.on('request', function(req, res){
	console.log(req.method + ' request');
	var uuid = req.url.split('/')[1];

	//runBLE(uuid, res);
	console.log('request received');
	requestComplete(res);
});

function requestComplete(response){
	console.log('finishing response');
	if(discoveries.size > 0){
		for(let discovery of discoveries) response.write(discovery);
	}else{
		response.write('no devices found');
	}
	//response.write(output);
	response.end('\n\n EOM');
}

//Provide coap port
server.listen(5683, function(){
	console.log('listening...');
});

noble.on('stateChange', function(state){
	console.log('State Change Event... ', state);
	if(state === 'poweredOn'){
		//console.log('Beginnin BLE scan for uuid ' + uuid);

		noble.startScanning([], false);
	} else{ 
		console.log('BLE turned off..');
		noble.stopScanning();
	}
});

noble.on('scanStart', function(){
	console.log('> Scanning...');
});

noble.on('scanStop', function(){
	console.log('> Finished Scanning...');
});

noble.on('discover', function(peripheral){
	//peripheral located, can stop scanning
	noble.stopScanning();
	console.log('> Peripheral Discovered');

	// advertisement contains: name, power level, advertised uuids, & manufacturer data0
	console.log('Found peripheral: ', peripheral.advertisement);
	var advertisement = peripheral.advertisement;
	discoveries.add(peripheral.id);

	peripheral.connect(function(err){
		//connect to peripheral, interrogate for requested service
		peripheral.discoverServices([uuid], function(err, services){
				
			services.forEach(function(service){
				//this service matches, so must be what we're looking for

				console.log('Requested Service discovered? ', service.uuid === uuid)
					
				service.discoverCharateristics([], function(err, characteristics){

					characteristics.forEach(function(characteristic){

						// just want to show them, until we have more meaningful operations
						console.log('Characteristic found: ', characteristic.uuid);
						requestComplete('Success', response);

					});

				});
			});
		
		});
	});
});