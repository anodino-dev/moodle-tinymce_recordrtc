// TinyMCE recordrtc library functions.
// @package    tinymce_recordrtc.
// @author     Jesus Federico  (jesus [at] blindsidenetworks [dt] com).
// @copyright  2016 to present, Blindside Networks Inc.
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later.

/** global: M */
/** global: URL */
/** global: params */
/** global: initialized variables */

M.tinymce_recordrtc = M.tinymce_recordrtc || {};

// Extract plugin settings to params hash.
(function() {
    var params = {};
    var r = /([^&=]+)=?([^&]*)/g;

    var d = function(s) {
        return decodeURIComponent(s.replace(/\+/g, ' '));
    };

    var search = window.location.search;
    var match = r.exec(search.substring(1));
    while (match) {
        params[d(match[1])] = d(match[2]);

        if (d(match[2]) === 'true' || d(match[2]) === 'false') {
            params[d(match[1])] = d(match[2]) === 'true' ? true : false;
        }
        match = r.exec(search.substring(1));
    }

    window.params = params;
})();

// Initialize some variables.
var player = null;
var startStopBtn = null;
var uploadBtn = null;
var countdownSeconds = null;
var countdownTicker = null;
var mediaRecorder = null;
var chunks = null;

/**
 * This function is initialized from PHP
 *
 * @param {Object}
 *            Y YUI instance
 */
M.tinymce_recordrtc.view_init = function() {
    // Assignment of global variables.
    player = document.querySelector('video#player');
    startStopBtn = document.querySelector('button#start-stop');
    uploadBtn = document.querySelector('button#upload');

    // Show alert if using non-ideal browser.
    M.tinymce_recordrtc.check_browser();

    // Run when user clicks on "record" button.
    startStopBtn.onclick = function() {
        var btn = this;
        btn.disabled = true;

        // If button is displaying "Start Recording" or "Record Again".
        if ((btn.textContent === M.util.get_string('startrecording', 'tinymce_recordrtc')) ||
            (btn.textContent === M.util.get_string('recordagain', 'tinymce_recordrtc')) ||
            (btn.textContent === M.util.get_string('recordingfailed', 'tinymce_recordrtc'))) {
            // Hide alert-danger if it is shown.
            var alert = document.querySelector('div[id=alert-danger]');
            alert.parentElement.parentElement.classList.add('hide');

            // Make sure the upload button is not shown.
            uploadBtn.parentElement.parentElement.classList.add('hide');

            // Change look of recording button.
            startStopBtn.classList.remove('btn-outline-danger');
            startStopBtn.classList.add('btn-danger');

            // Empty the array containing the previously recorded chunks.
            chunks = [];

            // Initialize common configurations.
            var commonConfig = {
                // When the stream is captured from the microphone/webcam.
                onMediaCaptured: function(stream) {
                    // Make video stream available at a higher level by making it a property of btn.
                    btn.stream = stream;

                    if (btn.mediaCapturedCallback) {
                        btn.mediaCapturedCallback();
                    }
                },

                // Revert button to "Record Again" when recording is stopped.
                onMediaStopped: function(btnLabel) {
                    btn.textContent = btnLabel;
                },

                // Handle recording errors.
                onMediaCapturingFailed: function(error) {
                    var btnLabel = null;

                    // If Firefox and Permission Denied error.
                    if ((error.name === 'PermissionDeniedError') && bowser.firefox) {
                        InstallTrigger.install({
                            'Foo': {
                                // Link: https://addons.mozilla.org/firefox/downloads/latest/655146/addon-655146...
                                // ...-latest.xpi?src=dp-btn-primary.
                                URL: 'https://addons.mozilla.org/en-US/firefox/addon/enable-screen-capturing/',
                                toString: function() {
                                    return this.URL;
                                }
                            }
                        });

                        btnLabel = M.util.get_string('startrecording', 'tinymce_recordrtc');
                    } else if ((error.name === 'DevicesNotFoundError') ||
                               (error.name === 'NotFoundError')) { // If Device Not Found error.
                        var alert = document.querySelector('div[id=alert-danger]');
                        alert.parentElement.parentElement.classList.remove('hide');
                        alert.textContent = M.util.get_string('inputdevicealert', 'tinymce_recordrtc') + ' ' + M.util.get_string('inputdevicealert', 'tinymce_recordrtc');

                        btnLabel = M.util.get_string('recordingfailed', 'tinymce_recordrtc');
                    }

                    // Proceed to treat as a stopped recording.
                    commonConfig.onMediaStopped(btnLabel);
                }
            };

            // Show video tag without controls to view webcam stream.
            player.parentElement.parentElement.classList.remove('hide');
            player.controls = false;

            // Capture audio+video stream from webcam/microphone.
            M.tinymce_recordrtc.captureAudioVideo(commonConfig);

            // When audio+video stream is successfully captured, start recording.
            btn.mediaCapturedCallback = function() {
                M.tinymce_recordrtc.startRecording(btn.stream);
            };

            return;
        } else { // If button is displaying "Stop Recording".
            // First of all clears the countdownTicker.
            clearInterval(countdownTicker);

            // Disable "Record Again" button for 1s to allow background processing (closing streams).
            setTimeout(function() {
                btn.disabled = false;
            }, 1000);

            // Stop recording.
            M.tinymce_recordrtc.stopRecording(btn.stream);

            // Change button to offer to record again.
            btn.textContent = M.util.get_string('recordagain', 'tinymce_recordrtc');
            startStopBtn.classList.remove('btn-danger');
            startStopBtn.classList.add('btn-outline-danger');

            return;
        }
    };
};

/////////////////////////
// Functions for capturing, recording, and uploading stream.
/////////////////////////

// Setup to get audio+video stream from microphone/webcam.
M.tinymce_recordrtc.captureAudioVideo = function(config) {
    M.tinymce_recordrtc.captureUserMedia(
        // Media constraints.
        {
            audio: true,
            video: {
              width: {ideal: 640},
              height: {ideal: 480}
            }
        },

        // Success callback.
        function(audioVideoStream) {
            console.log('getUserMedia() got stream:', audioVideoStream);

            // Set video player to play microphone+webcam stream.
            player.srcObject = audioVideoStream;
            player.play();

            config.onMediaCaptured(audioVideoStream);
        },

        // Error callback.
        function(error) {
            console.log('getUserMedia() error:', error);
            config.onMediaCapturingFailed(error);
        }
    );
};

M.tinymce_recordrtc.stopRecording = function(stream) {
    mediaRecorder.stop();

    stream.getTracks().forEach(function(track) {
        track.stop();
        console.log('MediaTrack stopped:', track);
    });

    // Set source of video player, then show it with controls enabled.
    var blob = new Blob(chunks, {
        type: 'video/webm;codecs=vp8'
    });
    player.src = URL.createObjectURL(blob);

    player.muted = false;
    player.controls = true;
    player.play();

    player.onended = function() {
        player.pause();
    };

    // Show upload button.
    uploadBtn.parentElement.parentElement.classList.remove('hide');
    uploadBtn.textContent = M.util.get_string('attachrecording', 'tinymce_recordrtc');
    uploadBtn.disabled = false;

    // Handle when upload button is clicked.
    uploadBtn.onclick = function() {
        // Trigger error if no recording has been made.
        if (!player.src || chunks === []) {
            return alert(M.util.get_string('norecordingfound', 'tinymce_recordrtc'));
        }

        var btn = uploadBtn;
        btn.disabled = true;

        // Upload recording to server.
        M.tinymce_recordrtc.uploadToServer('video', function(progress, fileURL) {
            if (progress === 'ended') {
                btn.disabled = false;
                M.tinymce_recordrtc.insert_annotation(fileURL);
                return;
            } else if (progress === 'upload-failed') {
                btn.disabled = false;
                btn.textContent = M.util.get_string('uploadfailed', 'tinymce_recordrtc');
                return;
            } else {
                btn.textContent = progress;
                return;
            }
        });
    };
};
