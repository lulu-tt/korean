'use strict';

var $preparingFileModal = $(".loadingbar");

var defaultBeforsend = function (jqXHR) {
	jqXHR.setRequestHeader("Authorization", "Bearer "+$('#_setToken').val());
};

var defaultGetOptions = {
		method: 'GET',
		contentType: 'text/plain; charset=UTF-8',
		dataType: 'json',
		cache:false
};
var defaultPostOptions = {
		method: 'POST',
		contentType: "application/json; charset=utf-8",
		dataType: 'json',
		xhrFields: { withCredentials: true }
};
var defaultPutOptions = {
		method: 'PUT',
		contentType: "application/json; charset=utf-8",
		dataType: 'json',
};
var defaultDeleteOptions = {
		method: 'DELETE',
		contentType: "application/json; charset=utf-8",
		dataType: 'json',
};
var defaultUploadOptions = {
		method: 'POST',
		contentType: false,
		processData: false,
};

var defaultDownloadOptions = {
		httpMethod: 'GET',
};

// if Http Status not 200
var commonErrorCallback = function (jqXHR, textStatus, errorThrown) {
	defaultFailCallback.call(jqXHR, textStatus,errorThrown);
	$preparingFileModal.hide();
};
// if undefined failCallback
var defaultFailCallback = function (response,status,error) { window.alert(status); };

var baseAjax = function (url, options, successCallback, failCallback) {
	var callBack = function (data) {
		$preparingFileModal.hide();
		if (data != null) {
			successCallback.call(this, data,options);
		} else {
			failCallback === undefined
				? defaultFailCallback.call(data, this,null)
				: failCallback.call(data, this,null);
		}
	};

	var requestUrl = url;
	$.ajax(requestUrl, options)
		.done(callBack).fail(failCallback === undefined ? commonErrorCallback : failCallback);
};

var downAjax = function (url, options, successCallback, failCallback) {
	var callBack = function (data) {
		if (data != null) {
			successCallback.call(this, data,options);
		} else {
			failCallback === undefined
				? defaultFailCallback.call(data, this,null)
				: failCallback.call(data, this,null);
		}
		$preparingFileModal.hide();
	};

	var requestUrl = url;
	$.fileDownload(requestUrl, options)
		.done(callBack).fail(failCallback === undefined ? commonErrorCallback : failCallback);
};

var getAjax = function (url, successCallback, failCallback, extendOptions, isLoadingBar) {
	if(isLoadingBar === undefined || isLoadingBar){
		$preparingFileModal.show();
	}
	
	let extendMethod;
	
	if(url.indexOf('http') == -1){
		extendMethod  = $.extend(defaultGetOptions, {beforeSend  : defaultBeforsend,});
	}
	
	baseAjax(url, $.extend(extendMethod, extendOptions), successCallback, failCallback);
};

var postAjax = function (url, successCallback, failCallback, extendOptions, isLoadingBar) {
	if(isLoadingBar === undefined || isLoadingBar){
		$preparingFileModal.show();
	}
	
	let extendMethod;
	
	if(url.indexOf('http') == -1){
		extendMethod  = $.extend(defaultPostOptions, {beforeSend  : defaultBeforsend,});
	}
	
	baseAjax(url, $.extend(extendMethod, extendOptions), successCallback, failCallback);
};

var putAjax = function (url, successCallback, failCallback, extendOptions, isLoadingBar) {
	if(isLoadingBar === undefined || isLoadingBar){
		$preparingFileModal.show();
	}
	
	let extendMethod;
	
	if(url.indexOf('http') == -1){
		extendMethod  = $.extend(defaultPutOptions, {beforeSend  : defaultBeforsend,});
	}
	
	baseAjax(url, $.extend(extendMethod, extendOptions), successCallback, failCallback);
};

var deleteAjax = function (url, successCallback, failCallback, extendOptions, isLoadingBar) {
	if(isLoadingBar === undefined || isLoadingBar){
		$preparingFileModal.show();
	}
	
	let extendMethod;
	
	if(url.indexOf('http') == -1){
		extendMethod  = $.extend(defaultDeleteOptions, {beforeSend  : defaultBeforsend,});
	}
	
	
	baseAjax(url, $.extend(extendMethod, extendOptions), successCallback, failCallback);
};

// add extendOptions data(formData Object)
var uploadAjax =  function (url, successCallback, failCallback, extendOptions, isLoadingBar) {
	if(isLoadingBar === undefined || isLoadingBar){
		$preparingFileModal.show();
	}

	let extendMethod;
	
	if(url.indexOf('http') == -1){
		extendMethod  = $.extend(defaultUploadOptions, {beforeSend  : defaultBeforsend,});
	}
	
	baseAjax(url, $.extend(extendMethod, extendOptions), successCallback, failCallback);
};

//add extendOptions data(formData Object)
var downloadAjax =  function (url, successCallback, failCallback, extendOptions, isLoadingBar) {

	if(isLoadingBar === undefined || isLoadingBar){
		$preparingFileModal.show();
	}

	let extendMethod;
	
	if(url.indexOf('http') == -1){
		extendMethod  = $.extend(defaultDownloadOptions, {beforeSend  : defaultBeforsend,});
	}
	
	downAjax(url, $.extend(extendMethod, extendOptions), successCallback, failCallback);
};

// args: url, successCallback, failCallback, extendOptions
var Ajax = {
	get: getAjax,
	post: postAjax,
	put: putAjax,
	upload: uploadAjax,
	delete: deleteAjax,
	download: downloadAjax,
};