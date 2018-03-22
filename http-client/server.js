var path = require('path');
var express = require('express');
var app = express();
var cookieParser = require('cookie-parser');
var coap = require('coap');
var dashboard = require('./dashboard.js')

app.use(cookieParser());

app.use(function(req,res,next){
	//console.log('cookies:' + req.cookies);

	//console.log('Cookies: ', req.cookies);

	var randomNumber = Math.random().toString();
	if(!req.cookies.token){
		res.cookie('token',randomNumber,{maxAge:(1000*60*10)});
	}

	next();
});

app.use('/',express.static( path.join( __dirname, '/public') ) )

app.get('/', function(req,res){
  res.sendFile(path.join(__dirname, 'public/pages/index.html'));
});

app.get('/:ip/alive', function(req,res){

	console.log('Server Search ' + req.url);


	var checkForProxy = coap.request('coap://'+req.params.ip+'/alive');

	checkForProxy.on('response', function(coapRes){

		coapRes.setEncoding('utf8');

		coapRes.on('data',function(chunk){
			console.log(chunk);
			res.write(chunk);
		});

		coapRes.on('end',function(){
			console.log('Coap response complete');
			res.end();
		});

	});
	checkForProxy.end();

});

//Take page name as param from url, navigate directory to requested page
app.get('/:page', function(req, res) {
  res.sendFile( path.join(__dirname, 'public', 'pages', path.basename(req.params.page) + '.html') );
});

app.use('/dashboard', dashboard);

app.listen(3000, console.log('listening on port 3000'));