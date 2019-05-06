var moduleCrop = {};
moduleCrop.cropper = {};

/* 初始化图片裁剪工具
* @param {Function} callback 回调函数 callback(data), data为裁剪后的图片数据
* @param {Object} o 参数 详情https://github.com/fengyuanchen/cropperjs#options
* @author pengxiguaa 2019-5-5
* */

moduleCrop.init = function(callback, o) {
  var options = {
    viewMode:0,
    aspectRatio: 1,
    checkCrossOrigin: false,
    movable: false
  };
  if(o) {
    for(var i in o) {
      options[i] = o[i];
    }
  }

  var $image = $('#module_crop_image');

  $image.cropper(options);

  moduleCrop.cropper = $image.data('cropper');

  moduleCrop.complete = function() {
    moduleCrop.cropper.getCroppedCanvas().toBlob(function(blob) {
      moduleCrop.hide();
      callback(blob);
    });
  };

  // 显示裁剪框
  moduleCrop.show = function() {
    $("#module_crop").show();
  };
  // 隐藏裁剪框
  moduleCrop.hide = function() {
    $("#module_crop").hide();
  };
  moduleCrop.selectFile = function() {
    $("#module_crop_input").click();
  };
  moduleCrop.selectedFile = function() {
    var files = $("#module_crop_input").prop('files');
    fileToUrl(files[0])
      .then(function(url) {
        moduleCrop.cropper.replace(url);
      })
  };

  moduleCrop.cancel = function() {
    moduleCrop.hide();
    $("#module_crop_input").val("");
  }
};
