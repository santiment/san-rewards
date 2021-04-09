@Library('podTemplateLib')
import net.santiment.utils.podTemplates

properties([buildDiscarder(logRotator(artifactDaysToKeepStr: '30', artifactNumToKeepStr: '', daysToKeepStr: '30', numToKeepStr: ''))])

slaveTemplates = new podTemplates()

slaveTemplates.dockerTemplate { label ->
  node(label) {
    stage('Build') {
      container('docker') {
        def scmVars = checkout scm

        if (env.BRANCH_NAME == "main"
            && scmVars.GIT_TAG_NAME != null
            && scmVars.GIT_TAG_NAME.contains('relay')) {
          withCredentials([
            string(
              credentialsId: 'aws_account_id',
              variable: 'aws_account_id'
            )
          ]) {
            // We are building one docker image - for stage and prod. The app requires an env vars
            // at launch time.
            def awsRegistry = "${env.aws_account_id}.dkr.ecr.eu-central-1.amazonaws.com"
            docker.withRegistry("https://${awsRegistry}", "ecr:eu-central-1:ecr-credentials") {
              sh "docker build -t ${awsRegistry}/san-rewards-relay:${scmVars.GIT_TAG_NAME} ."
              sh "docker push ${awsRegistry}/san-rewards-relay:${scmVars.GIT_TAG_NAME}"
            }
          }
        }
      }
    }
  }
}
