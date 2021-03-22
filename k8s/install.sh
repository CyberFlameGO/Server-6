# Create all namespaces used by the app
kubectl apply -f k8s/namespace.yaml

# Install app
kubectl apply -f k8s/traefik.yaml
kubectl apply -f k8s/ingress

# Install docker registry
# kubectl apply -f k8s/registry
# For resetting credentials:
# kubectl delete secret -n docker-registry docker-registry-access && kubectl create secret -n docker-registry generic docker-registry-access --from-file k8s/local/docker-auth.txt

# Quick Create
# cat <<EOF | kubectl apply -f -
# 	apiVersion: v1
# 	...
# EOF