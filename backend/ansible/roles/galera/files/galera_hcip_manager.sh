#!/bin/bash
HCIP="10.0.0.100" # This is your Health Check IP
STATE=$(mariadb -N -s -e "SHOW GLOBAL STATUS LIKE 'wsrep_local_state_comment';" | awk '{print $2}')
INDEX=$(mariadb -N -s -e "SHOW GLOBAL STATUS LIKE 'wsrep_local_index';" | awk '{print $2}')

if [ "$STATE" == "Synced" ] && [ "$INDEX" == "0" ]; then
    if ! ip addr show dummy0 | grep -q "$HCIP"; then
        ip addr add $HCIP/32 dev dummy0
        ip link set dummy0 up
    fi
else
    ip addr del $HCIP/32 dev dummy0 2>/dev/null
    ip link set dummy0 down 2>/dev/null
fi
