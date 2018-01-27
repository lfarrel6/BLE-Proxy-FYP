var coap   = require('coap')
  , noble  = require('noble')
  , server = coap.createServer();

//Code to execute every time a request comes in - Request obj is an instance of IncomingMessage
server.on('request', function(request,response){
	// Begin scanning 
	console.log("Beginning Scanning for Devices");
	noble.startScanning();
	response.end('Hello ' + request.url.split('/')[1] + '\n');
	noble.stopScanning();
	console.log("Finishing Scanning for Devices");
});

server.listen(function(){
	var request = coap.request('coap://localhost/Liam');

	request.on('response', function(response){
		response.pipe(process.stdout);
		response.on('end', function(){
			console.log('That\'s all she wrote\n');
		});
	});

	request.end();
});