/**
 *
 */
'use strict';
var defaultAction = function(e,actionCallback,_this){
	actionCallback(e,_this);
}

var clickInit = function(id,actionCallback){

		$(document).on("click",id,function(e){
			defaultAction(e,actionCallback,this);
		});
}

var changeInit = function(id,actionCallback){
		$(document).on("change",id,function(e){
			defaultAction(e,actionCallback,this);
		});
}

var keydownInit = function(id,actionCallback){
		$(document).on("keydown",id,function(e){
			defaultAction(e,actionCallback,this);
		});
}

var ActionInit = {
	click : clickInit,
	change : changeInit,
	keydown : keydownInit,
}