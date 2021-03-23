certbot certonly \
	--server https://acme-v02.api.letsencrypt.org/directory \
	--manual --preferred-challenges dns \
	-d '7tv.app,*.7tv.app'
