var mqtt = require('mqtt');
var events = require('events');
var clients = {};

var MQTTClient = function(){
	this.clients = {}; //one client per mqttserver
};

MQTTClient.prototype = new events.EventEmitter;

MQTTClient.prototype.hasClient = function(addr){
	var self = this;
	if(self.clients[addr]){
		return true;
	}else{
		return false;
	}
}

MQTTClient.prototype.createClient = function(addr,port=1883){
	var self = this;
	self.clients[addr] = mqtt.connect(addr+':'+port);
	self.clients[addr].on('connect',function(){
		console.log('Client connected to ' + addr + ' on ' + port);
		self.emit('connect');
		self.clients[addr].on('message',function(topic,message){
			console.log('New Message! ' + topic.toString() + ': ' + message.toString());
			self.emit('message',addr,topic,message)
		});
	});
}

MQTTClient.prototype.subscribe = function(addr,topic){
	var self = this;
	if(self.clients[addr]){
		self.clients[addr].subscribe(topic,function(subErr){
			if(subErr){
				self.emit('error',subErr);
			}else{
				self.emit('subscribe');
			}
		});
	}
}

MQTTClient.prototype.unsubscribe = function(addr,topic){
	var self = this;
	if(self.clients[addr].connected){
		self.clients[addr].unsubscribe(topic, function(unsubErr){
			if(unsubErr){
				self.emit('error',unsubErr);
			}else{
				self.emit('unsubscribe');
			}
		});
	}
}

module.exports = MQTTClient;