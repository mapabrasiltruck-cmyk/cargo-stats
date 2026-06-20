(function() {
    const VERSION_CHECK_TIMEOUT = 10000;
    let updateVersion = null;
    let updateReady = false;
    let timeoutId = null;

    function $(id) { return document.getElementById(id); }

    function goToDashboard() {
        window.location.href = 'dashboard_local.html';
    }

    function showCard() {
        $('spinner').style.display = 'none';
        $('status-text').textContent = 'Atualiza\u00e7\u00e3o encontrada!';
        $('update-card').classList.add('show');
    }

    function showProgress(percent) {
        $('progress-section').classList.add('show');
        $('progress-fill').style.width = Math.round(percent) + '%';
        $('progress-text').textContent = Math.round(percent) + '%';
    }

    function showRestart() {
        $('btn-group').style.display = 'none';
        $('progress-section').classList.remove('show');
        $('btn-restart-group').style.display = 'flex';
        $('status-text').textContent = 'Atualiza\u00e7\u00e3o pronta!';
    }

    function onUpdateAvailable(version) {
        updateVersion = version;
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        $('update-description').textContent =
            'A vers\u00e3o ' + version + ' do Cargo Stats est\u00e1 dispon\u00edvel. Deseja instalar agora?';
        showCard();
    }

    function onUpdateProgress(percent) {
        showProgress(percent);
        $('btn-install').disabled = true;
        $('btn-install').textContent = 'Baixando...';
    }

    function onUpdateDownloaded() {
        updateReady = true;
        showRestart();
    }

    window.cargoStats.getVersion().then(function(v) {
        $('app-version').textContent = 'v' + v;
    });

    window.cargoStats.onUpdateAvailable(onUpdateAvailable);
    window.cargoStats.onUpdateProgress(onUpdateProgress);
    window.cargoStats.onUpdateDownloaded(onUpdateDownloaded);

    $('btn-install').addEventListener('click', function() {
        if (window.cargoStats && window.cargoStats.downloadUpdate) {
            window.cargoStats.downloadUpdate();
        }
    });

    $('btn-later').addEventListener('click', goToDashboard);

    $('btn-restart').addEventListener('click', function() {
        if (window.cargoStats && window.cargoStats.restartAndUpdate) {
            window.cargoStats.restartAndUpdate();
        }
    });

    $('btn-restart-later').addEventListener('click', goToDashboard);

    timeoutId = setTimeout(function() {
        timeoutId = null;
        if (!$('update-card').classList.contains('show')) {
            $('status-text').textContent = 'Nenhuma atualiza\u00e7\u00e3o encontrada. Iniciando...';
            setTimeout(goToDashboard, 1500);
        }
    }, VERSION_CHECK_TIMEOUT);
})();
