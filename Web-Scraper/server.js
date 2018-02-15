var express = require('express'),
    fs      = require('fs'),
    request = require('request'),
    cheerio = require('cheerio'),
    app     = express();

app.get('/scrape/*', function(req, res){

	//console.log(req.originalUrl);

	var args = req.originalUrl.split('/');

	var reverse, filename;

	if(args[2].includes('&')){
		reverse = args[2].split('&');
		console.log(reverse);

		filename = reverse[0]+'.json';

		reverse = (reverse[1] == "r=1")?true:false;
	}else{
		filename = args.length > 2 ? args[2] + '.json' :'output.json';
	}
	console.log(filename);

	var characteristic, uuid;
	var json = {}, jsonR = {};

	url = "https://www.bluetooth.com/specifications/gatt/characteristics";
	request(url, function(error, response, html){

		if(!error){
			var $ = cheerio.load(html);

			$('#gattTable').filter(function(){

				var table = $(this);

				$('tr').each( (i, elm) => {
					if(i > 0){
						characteristic = $(elm).children().first().text();
						uuid = $(elm).children().eq(2).first().text();

						json[characteristic] = uuid;
						if(reverse){
							jsonR[uuid] = characteristic;
						}
					}
				});

				fs.writeFile(filename, JSON.stringify(json, null, 4), function(err){
					console.log('File written! Check the project directory.');
				})
				if(reverse){
					fs.writeFile(('reversed-' + filename), JSON.stringify(jsonR, null, 4), function(err){
						console.log('Reverse file written! Check the project directory.');
					})
				}

			})
		} else{
			console.log("err")
		}

	})

	res.send('Check your console.');

})

app.listen('8081')
console.log("Running on port 8081");

exports = module.exports = app;