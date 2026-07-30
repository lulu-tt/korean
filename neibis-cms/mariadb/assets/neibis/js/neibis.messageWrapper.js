/**
 *
 */
'use strict';

var alertDefault = function(data){
	alert(data.message);
}

var defaultCancel = function(){
	return false;
}

var alertNonTitle = function(data,confirmCallback){
	if(data.icon == null){
		confirmCallback.call();
	}else{
		alert({
			icon: data.icon,
			message: data.message,
		}, function () {
        confirmCallback.call();
    	});
	}
}

var alertTitle = function(data,confirmCallback){
	if(data.icon == null){
		confirmCallback.call();
	}else{
		alert({
				icon: data.icon,
				title: data.title,
				message: data.message,
			}, function () {
	        confirmCallback.call();
	    });
	}
}

var confirmDefault = function(data,confirmCallback,cancelCallbak){
	confirm({
        	icon: data.icon,
			title: "",
			message: data.message
   			}, function (result) {
        if (result) {
            confirmCallback.call();
        } else {
            typeof cancelCallbak !== "undefined" ? cancelCallbak.call() : defaultCancel;
        }
    });
}

var confirmTitle = function(data,confirmCallback,cancelCallbak){
	confirm({
        icon: data.icon,
			title: data.title,
			message: data.message
   			}, function (result) {
        if (result) {
            confirmCallback.call();
        } else {
            typeof cancelCallbak !== "undefined" ? cancelCallbak.call() : defaultCancel;
        }
    });
}


var alertMessage = function(data,confirmCallback){
	var jsonParse = JSON.parse(JSON.stringify(data));
	if(typeof confirmCallback === "undefined"){
		alertDefault(jsonParse);
	}else{
		if(typeof data.title === "undefined" || data.title == ""){
			alertNonTitle(jsonParse,confirmCallback);
		}else{
			alertTitle(jsonParse,confirmCallback);
		}
	}
}

var confirmMessage = function(data,confirmCallback,cancelCallbak){
	var jsonParse = JSON.parse(JSON.stringify(data));
		if(typeof data.title === "undefined" || data.title == ""){
			confirmDefault(jsonParse,confirmCallback,cancelCallbak);
		}else{
			confirmTitle(jsonParse,confirmCallback,cancelCallbak);
		}
	}

var successAlert = function(data,confirmCallback){
	console.log(data);
	var jsonParse = JSON.parse(JSON.stringify(data));
	if(data.title == ""){
		alertNonTitle(jsonParse,confirmCallback);
	}else{
		alertTitle(jsonParse,confirmCallback);
	}
}

var failAlert = function(xhr, status, error,confirmCallback){
	var obj = new Object();
		$.each(xhr,function(i,v){
						console.log(v);
			if(i == "responseJSON"){
				obj.icon = v.icon;
				obj.message = v.message;
				alertNonTitle(obj,confirmCallback);
			}
		});
}

var Message = {
	alert : alertMessage,
	confirm : confirmMessage,
	success : successAlert,
	fail : failAlert,
}