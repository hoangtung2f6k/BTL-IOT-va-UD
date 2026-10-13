@echo off
REM ============================================================
REM Demo bao mat: gia mao mot goi lenh bat den voi JWT token sai.
REM Ket qua mong doi:
REM   Terminal C : AUTH=INVALID user=hacker (token khong hop le)
REM   Backend    : "Lenh CLI khong kem token hop le, bo qua: den=ON"
REM   CSDL       : KHONG co ban ghi nao duoc them
REM ============================================================
cd /d "%~dp0"
node -e "require('dotenv').config({quiet:true}); const m=require('mqtt'); const c=m.connect(process.env.MQTT_BROKER,{clientId:'ke_gia_mao'}); c.on('connect',()=>{ const p=JSON.stringify({requestId:'fake0001',device:'den',action:'ON',source:'cli',auth:{username:'hacker',token:'token.gia.mao'}}); c.publish(process.env.MQTT_TOPIC_DEVICE_CONTROL,p,{qos:1},()=>{ console.log('DA GUI GOI GIA MAO:'); console.log(p); c.end(false,()=>process.exit(0)); }); }); c.on('error',e=>{ console.log('LOI: '+e.message); process.exit(1); });"
echo.
pause
