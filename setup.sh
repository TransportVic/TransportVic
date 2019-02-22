echo "LANG=en_US.utf-8
LC_ALL=en_US.utf-8" | sudo tee /etc/environment

sudo yum install make glibc-devel gcc patch gcc-c++ -y

sudo yum update -y
curl -sL https://rpm.nodesource.com/setup_11.x | sudo bash -
sudo yum install nodejs --enablerepo=nodesource -y

echo "[mongodb-org-4.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/amazon/2013.03/mongodb-org/4.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-4.0.asc" | sudo tee /etc/yum.repos.d/mongodb-org-4.0.repo
sudo yum install -y mongodb-org

sudo yum install git

sudo amazon-linux-extras install epel -y
sudo yum install certbot-apache -y
