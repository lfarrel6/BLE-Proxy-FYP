var mqtt = require('mqtt');
var events = require('events');
var clients = {};

var MQTTManager = function(){
	this.clients = {}; //one client per mqttserver
};

MQTTManager.prototype = new events.EventEmitter;

MQTTManager.prototype.hasClient = function(addr){
	var self = this;
	if(self.clients[addr]){
		return true;
	}else{
		return false;
	}
}

MQTTManager.prototype.createClient = function(addr,port=1883){
	var self = this;
	self.clients[addr] = mqtt.connect('mqtt://'+addr+':'+port);
	self.clients[addr].subscriptions = {};
	self.clients[addr].on('connect',function(){
		console.log('Client connected to ' + addr + ' on ' + port);
		self.emit('connect');
	});
	self.clients[addr].on('message',function(topic,message,p){
		console.log('New Message! ' + topic.toString() + ': ' + message.toString());
		self.emit('message',addr,topic,message);
		self.clients[addr].subscriptions[topic].push(message);
	});
}

MQTTManager.prototype.subscribe = function(addr,topic){
	var self = this;
	if(self.clients[addr]){
		self.clients[addr].subscribe(topic,function(subErr){
			if(subErr){
				self.emit('error',subErr);
			}else{
				self.clients[addr].subscriptions[topic]={};
				self.emit('subscribe');
			}
		});
	}
}

MQTTManager.prototype.unsubscribe = function(addr,topic){
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

MQTTManager.prototype.isSubscribed = function(addr,topic){
	var self = this;
	if(self.clients[addr].subscriptions[topic]){
		return true;
	} 
	return false;
}

MQTTManager.prototype.getMessages = function(addr,topic){
	var self = this;
	return {messages: self.clients[addr].subscriptions[topic]};
}

module.exports = MQTTManager;