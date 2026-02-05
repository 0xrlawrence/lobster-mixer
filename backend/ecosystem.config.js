module.exports = {
    apps: [
        {
            name: 'lobster-orchestrator',
            script: './orchestrator-batch.js',
            cwd: '/Users/rlawrence/Desktop/moltpodmesh/backend',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            },
            error_file: './logs/orchestrator-error.log',
            out_file: './logs/orchestrator-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            // Restart if no output for 5 minutes
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000
        }
    ]
};
