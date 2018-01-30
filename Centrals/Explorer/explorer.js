var noble  = require('noble')
  , coap   = require('coap')
  , server = coap.createServer();

server.on('request', function(req, res){
	var uuid = req.url.split('/')[1];

	runBLE(uuid, res);
});

function requestComplete(output, response){
	response.write(output);
	res.end('\n\n EOM');
}

server.listen(function(){
	/*var req = coap.request('coap://localhost/tester');

	req.on('response', function(res){
		res.pipe(process.stdout);
		res.on('end', function(){
			console.log('\n---\n');
		});
	});

	req.end();*/
});

function runBLE(uuid, response){
	console.log('running ble');
	noble.on('stateChange', function(state){
		console.log('State Change Event... ', state);
		if(state === 'poweredOn'){
			console.log('Beginnin BLE scan for uuid ' + uuid);
			// Begin scan, looking for given uuid, do not allow duplicates
			
			console.log('> Scanning...');
			noble.startScanning([uuid], false);

		} else{ 
			console.log('BLE turned off..');
			noble.stopScanning();
		}
	});

	noble.on('discover', function(peripheral){
		//peripheral located, can stop scanning
		
		console.log('> Scanning Complete...');
		noble.stopScanning();

		// advertisement contains: name, power level, advertised uuids, & manufacturer data0
		console.log('Found peripheral: ', peripheral.advertisement);

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
}