./shared/bin/smart-test /dev/sda short
./shared/bin/smart-test /dev/sdb short
sleep 125 # 2 min 5 seconds     
./shared/bin/smart-test /dev/sda status
./shared/bin/smart-test /dev/sdb status
