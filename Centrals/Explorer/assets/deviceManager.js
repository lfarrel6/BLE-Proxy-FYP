var events = require('events');

var DeviceManager = function(){
	this.discoveries = [];
	this.discoveries_LUT = {};
}

DeviceManager.prototype = new events.EventEmitter;

DeviceManager.prototype.deviceExists = function(id){
	var self = this;
	if(self.discoveries[id] || self.discoveries_LUT.hasOwnProperty(id)){
		return true;
	}
	return false;
}

DeviceManager.prototype.getIndex = function(id){
	var self=this;
	return self.discoveries_LUT[id];
}

DeviceManager.prototype.getAll = function(){
	var self = this;
	var resJSON={};
	var keys = Object.keys(self.discoveries_LUT);
	for(var k in keys){
		resJSON[ keys[k] ] = self.discoveries[ self.discoveries_LUT[ keys[k] ] ];
	}
	return resJSON;
}

DeviceManager.prototype.getDevice = function(ind, uuid=false){
	var self = this;
	console.log((uuid?'uuid: ':'index: ')+ind);
	if(uuid)
		ind = self.discoveries_LUT[ind];
	return self.discoveries[ind];
}

DeviceManager.prototype.addDevice = function(obj){
	var self = this;
	if(self.deviceExists(obj.peripheral.id)){
		self.discoveries[ self.discoveries_LUT[obj.peripheral.id] ].lastSeen = Date.now();
		return;
	}else{
		var l = self.discoveries.length;
		self.discoveries.push(obj);
		self.discoveries_LUT[obj.peripheral.id] = l;
		self.emit('new',obj);
	}
}

DeviceManager.prototype.updateLastSeen = function(id){
	var self = this;
	self.discoveries[self.discoveries_LUT[id]].lastSeen = Date.now();
}

DeviceManager.prototype.updateDevice = function(ind,key,val,overwrite=true){
	var self=this;
	if(overwrite){
		self.discoveries[ self.discoveries_LUT[ind] ][key]=val;
	}else{
		//self.disoveries[ind][key]=self.disoveries[ind][key]+val; 
	}
}

DeviceManager.prototype.postDevice = function(ind,dev,uuid=false){
	var self = this;
	if(uuid)
		ind = self.discoveries_LUT[uuid];
	self.discoveries[ind] = dev;
}

module.exports = DeviceManager;