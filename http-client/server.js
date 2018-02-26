var path = require('path')
var express = require('express')
var app = express()
var cookieParser = require('cookie-parser');

var dashboard = require('./dashboard.js')

app.use(cookieParser());

app.use(function(req,res,next){
	//console.log('cookies:' + req.cookies);

	var randomNumber = Math.random().toString();
	res.cookie('token',randomNumber,{maxAge:(1000*60*10)});
	console.log('token created');

	//console.log('cookies:' + req.cookies);
	
	next();
});

app.use('/',express.static( path.join( __dirname, '/public') ) )

app.get('/', function(req,res){
  res.sendFile(path.join(__dirname, 'public/pages/index.html'));
});

//Take page name as param from url, navigate directory to requested page
app.get('/:page', function(req, res) {
  res.sendFile( path.join(__dirname, 'public', 'pages', path.basename(req.params.page) + '.html') );
});

app.use('/dashboard', dashboard);

app.listen(3000, console.log('listening on port 3000'));