@echo off
REM Deploy RedCat Discord gateway files from this PC to the Oracle VM.
REM Run from an SSH session: C:\Users\HOME\redcat-discord-gateway\deploy-vm.bat
REM Does NOT contain the token; rg-env is copied as the VM .env file.
set VM=ubuntu@137.23.39.189
ssh -i oracle-vm-key %VM% "mkdir -p /home/ubuntu/redcat-gateway"
scp -i oracle-vm-key C:\Users\HOME\redcat-discord-gateway\rg-env %VM%:/home/ubuntu/redcat-gateway/.env
scp -i oracle-vm-key C:\Users\HOME\redcat-discord-gateway\vm\gateway.js %VM%:/home/ubuntu/redcat-gateway/gateway.js
scp -i oracle-vm-key C:\Users\HOME\redcat-discord-gateway\vm\package.json %VM%:/home/ubuntu/redcat-gateway/package.json
scp -i oracle-vm-key C:\Users\HOME\redcat-discord-gateway\vm\redcat-gateway.service %VM%:/home/ubuntu/redcat-gateway/redcat-gateway.service
scp -i oracle-vm-key C:\Users\HOME\redcat-discord-gateway\vm\setup-vm.sh %VM%:/home/ubuntu/redcat-gateway/setup-vm.sh
ssh -i oracle-vm-key %VM% "chmod 600 /home/ubuntu/redcat-gateway/.env && ls -l /home/ubuntu/redcat-gateway/"
