/* Shared helpers for actions that write to the /api/v1 backend. */
(function () {
  var NXActions = {
    /* Run an async action, surface server errors and show a single success toast. */
    run: function (task, success, failure) {
      return Promise.resolve().then(task).then(function (result) {
        if (success) UI.toast(success);
        return result;
      }).catch(function (error) {
        UI.toast((error && error.message) || failure || 'Could not complete the request');
        return null;
      });
    },

    download: function (path, filename, failure) {
      return NXActions.run(function () { return NXApi.download(path, filename); }, 'Download started', failure || 'Could not download the file');
    },

    /* Upload a selected file, including its conversation/customer context. */
    uploadFile: function (file, extra) {
      if (!file) return Promise.resolve(null);
      return NXApi.dataUrlToBase64(file).then(function (base64) {
        var body = { name: file.name || 'attachment', mimeType: file.type || 'application/octet-stream', dataBase64: base64 };
        Object.keys(extra || {}).forEach(function (key) { if (extra[key] !== undefined) body[key] = extra[key]; });
        return NXApi.mutate('POST', '/files', body);
      });
    }
  };
  window.NXActions = NXActions;
})();
